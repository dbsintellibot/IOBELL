# FixSchedule2: ESP32 Schedule Day Mapping — Analysis & Remediation Plan

**Summary**
- Symptom: Devices play test_buzzer/test_audio correctly but miss scheduled rings.
- Root cause: Inconsistent day-of-week encoding between backend JSON and firmware variants. Firmware uses `tm_wday` (0=Sun…6=Sat) while some schedule payloads and one firmware variant expect 1–7 (Mon=1…Sun=7) or pass through values without normalization.
- Goal: Normalize days across all ESP32 firmware, verify backend payloads, and ensure robust parsing for both single-int and array day formats.

**Where It Happens**
- Firmware time source returns `tm_wday` as 0–6: [main_40pin.cpp:getCurrentTime](file:///d:/My%20Drive/AutoBell/esp32-firmware/src/main_40pin.cpp#L916-L931)
- Current robust parsing with 7→0 normalization exists in:
  - [main_40pin.cpp:parseSchedules](file:///d:/My%20Drive/AutoBell/esp32-firmware/src/main_40pin.cpp#L1806-L1879)
  - [main_wroom.cpp:parseSchedules](file:///d:/My%20Drive/AutoBell/esp32-firmware/src/main_wroom.cpp#L1809-L1889)
  - [main_s3.cpp:parseSchedules](file:///d:/My%20Drive/AutoBell/esp32-firmware/src/main_s3.cpp#L1682-L1761)
  - Legacy note removed; only active variants maintained
- Backend RPC returns compact schedule JSON with day field `d` sourced from DB: [optimize_get_device_config.sql](file:///d:/My%20Drive/AutoBell/supabase/migrations/20260213000000_optimize_get_device_config.sql#L41-L63)
- Database originally models `day_of_week` as 0–6 with Sunday=0; some UI paths present 7 for Sunday and convert back to 0 when persisting (sources under `web-dashboard/src/pages/ProfileEditor.tsx`).

**Standardize Day Encoding**
- Device comparison basis: `tm_wday` where Sun=0, Mon=1, …, Sat=6.
- Accepted incoming formats:
  - Single int: `d: 1…7` or `d: 0…6`
  - Array: `d: [ … ]` or legacy `days_of_week: [ … ]`
- Canonical normalization: convert all Sunday `7` values to `0`; keep `1…6` and `0` unchanged.

**Firmware Action Plan**
- Implement a small normalization helper and use it for every pushed day:

```cpp
inline int normalizeDay(int d) { return d == 7 ? 0 : d; }
```

```cpp
// Single int
if (obj["d"].is<int>()) {
  int v = normalizeDay(obj["d"].as<int>());
  item.days.push_back(v);
}
// Array 'd'
else if (!obj["d"].isNull()) {
  for (JsonVariantConst v : obj["d"].as<JsonArrayConst>()) {
    item.days.push_back(normalizeDay(v.as<int>()));
  }
}
// Legacy 'days_of_week'
else {
  JsonArrayConst legacy = obj["days_of_week"];
  if (!legacy.isNull()) {
    for (int v : legacy) item.days.push_back(normalizeDay(v));
  }
}
```

- Apply identically in all maintained device variants:
  - main_40pin.cpp, main_wroom.cpp, main_s3.cpp.
- Ensure schedule checker compares exact `tm_wday`:
  - `for (int day : sch.days) if (day == d) dayMatch = true;`

**Backend Alignment**
- Keep returning `d` from `day_of_week` exactly as stored; storage should remain 0–6 for canonical simplicity.
- When the UI shows Sunday as 7, convert back to 0 before saving. Existing UI code already performs `day === 7 ? 0 : day`.
- For grouped schedules, ensure JSON uses the compact key `d` with an integer array; legacy `days_of_week` should remain as a fallback alias only.

**Stale Cache Consideration**
- Devices may have legacy schedules in LittleFS without normalization. After deploying normalization, force a resync or delete `/schedules.json` to avoid stale payloads.
- During startup, if deserializing cached schedules, run the same normalization on parsed days.

**Diagnostics To Confirm**
- Keep the day mismatch log to surface errors:
  - [main_40pin.cpp:checkSchedule](file:///d:/My%20Drive/AutoBell/esp32-firmware/src/main_40pin.cpp#L1925-L1994)
  - [main_wroom.cpp:checkSchedule](file:///d:/My%20Drive/AutoBell/esp32-firmware/src/main_wroom.cpp#L1928-L1979)
- Add one-time summary per schedule item after parsing:
  - “Parsed Schedule: HH:MM:SS (Final Days: …)” already present in most variants.

**Acceptance Tests**
- Payloads to verify:
  - Single-int Sunday as 7: `{"t":"08:00:00","d":7,"tr":12}`
  - Array with mixed encodings: `{"t":"09:00:00","d":[1,2,7],"tr":10}`
  - Legacy key: `{"bell_time":"10:15:00","days_of_week":[0,3,5],"track_number":12}`
- Expected: All devices ring when `tm_wday` equals normalized day and time matches within the allowed window.
- Run devices over a full week; observe `[Scheduler] Time match ... expects: [...]` never reports mismatch for correctly encoded days.

**Rollback / Safety**
- Changes are read-only to parsing and comparison; they do not alter schedule persistence format aside from normalization on read.
- If issues arise, disable normalization temporarily on one device to compare behavior.

**Outcome**
- With uniform normalization and diagnostics, ESP32 will consistently match schedule days across all variants while continuing to support both compact (`d`) and legacy (`days_of_week`) payloads.
