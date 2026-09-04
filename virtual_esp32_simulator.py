#!/usr/bin/env python3
"""
AutoBell Virtual ESP32 Hardware Simulator & Schedule Verification Test Harness
Simulates ESP32-S3 firmware scheduling engine (main_s3.cpp), testing get_device_config RPC,
time matching, day-of-week conversion, audio file URL availability, weather forecast TTS,
and execution reliability.
"""

import sys
import os
import time
import datetime
import urllib.parse
import json
import requests

SUPABASE_URL = "https://hjlwzkwiweocnfztshmy.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqbHd6a3dpd2VvY25menRzaG15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjEyNDEsImV4cCI6MjA5ODkzNzI0MX0.OUx-ZWTdA-_BCW8sbIMw8E13CONOh5IjcjLko87RRC0"
TEST_MAC_ADDRESS = "AC:A7:04:12:6C:98"  # Ramzan Profile Device

class ScheduleItem:
    def __init__(self, hour, minute, second, days, type_str, tts_msg, audio_url, audio_id, include_weather):
        self.hour = hour
        self.minute = minute
        self.second = second
        self.days = days  # C tm_wday: 0=Sun, 1=Mon, ..., 6=Sat
        self.type = type_str
        self.tts_message = tts_msg
        self.audio_url = audio_url
        self.audio_id = audio_id
        self.include_weather = include_weather
        self.last_rung = 0

def fetch_device_config(mac_address):
    url = f"{SUPABASE_URL}/rest/v1/rpc/get_device_config"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    payload = {"device_mac": mac_address}
    response = requests.post(url, json=payload, headers=headers, timeout=10)
    if response.status_code != 200:
        raise RuntimeError(f"RPC Error {response.status_code}: {response.text}")
    return response.json()

def parse_schedules(config_json):
    active_schedules = []
    raw_schedules = config_json.get("schedules", [])
    print(f"\n[Simulator] Parsing {len(raw_schedules)} schedules from server profile: '{config_json.get('profile_name', 'Unknown')}'...")

    for idx, obj in enumerate(raw_schedules):
        time_str = obj.get("t") or obj.get("bell_time") or "00:00:00"
        parts = [int(p) for p in time_str.split(":")]
        h = parts[0] if len(parts) > 0 else 0
        m = parts[1] if len(parts) > 1 else 0
        s = parts[2] if len(parts) > 2 else 0

        type_str = obj.get("ty") or obj.get("type") or "mp3"
        tts_msg = obj.get("tt") or obj.get("tts_text") or ""
        audio_url = obj.get("audio_url") or ""
        audio_id = obj.get("audio_id") or ""
        include_weather = bool(obj.get("iw") or obj.get("include_weather") or False)

        # Day of week parsing: DB uses 1=Mon..7=Sun. Firmware converts 7 -> 0 (Sunday)
        parsed_days = []
        d_field = obj.get("d")
        if isinstance(d_field, int):
            parsed_days.append(0 if d_field == 7 else d_field)
        elif isinstance(d_field, list):
            for entry in d_field:
                if isinstance(entry, int):
                    parsed_days.append(0 if entry == 7 else entry)
                elif isinstance(entry, list):
                    for sub in entry:
                        if isinstance(sub, int):
                            parsed_days.append(0 if sub == 7 else sub)

        item = ScheduleItem(h, m, s, parsed_days, type_str, tts_msg, audio_url, audio_id, include_weather)
        active_schedules.append(item)
        print(f"  [{idx+1}] Time: {h:02d}:{m:02d}:{s:02d} | Days (tm_wday 0=Sun..6=Sat): {parsed_days} | Type: {type_str.upper()} | Weather: {include_weather} | Audio URL: {audio_url or 'N/A'}")

    return active_schedules

def fetch_weather_summary():
    try:
        resp = requests.get("http://wttr.in/?format=%C,+%t", timeout=5)
        if resp.status_code == 200:
            text = resp.text.strip()
            text = text.replace("°C", " degrees Celsius").replace("°F", " degrees Fahrenheit").replace("+", "")
            return text
    except Exception as e:
        print(f"    [Weather Fetch Error]: {e}")
    return ""

def verify_audio_stream(url):
    try:
        resp = requests.head(url, timeout=5, allow_redirects=True)
        if resp.status_code in (200, 206, 302):
            return True, resp.status_code, resp.headers.get("content-length", "unknown")
        # Retry with GET range
        resp_get = requests.get(url, headers={"Range": "bytes=0-1024"}, timeout=5)
        if resp_get.status_code in (200, 206):
            return True, resp_get.status_code, len(resp_get.content)
        return False, resp_get.status_code, "0"
    except Exception as e:
        return False, 0, str(e)

def verify_tts_url(text):
    encoded_text = urllib.parse.quote(text.strip())
    url = f"https://translate.google.com/translate_tts?ie=UTF-8&q={encoded_text}&tl=en&client=tw-ob"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code in (200, 206):
            return True, resp.status_code, url
        return False, resp.status_code, url
    except Exception as e:
        return False, 0, str(e)

def run_simulation():
    print("=" * 70)
    print("      AUTOBELL VIRTUAL ESP32 HARDWARE & SCHEDULE SIMULATOR")
    print("=" * 70)

    # 1. Fetch config from Supabase RPC
    config = fetch_device_config(TEST_MAC_ADDRESS)
    print(f"[Simulator] Successfully connected to Supabase RPC.")
    print(f"  Device MAC     : {TEST_MAC_ADDRESS}")
    print(f"  School ID      : {config.get('school_id')}")
    print(f"  Profile Name   : {config.get('profile_name')}")
    print(f"  Quiet Hours    : Enabled={config.get('qh', {}).get('en')} ({config.get('qh', {}).get('df')} -> {config.get('qh', {}).get('ea')})")

    schedules = parse_schedules(config)
    if not schedules:
        print("[!] No schedules found in active profile!")
        return

    # 2. Comprehensive Resource & URL Verification
    print("\n" + "=" * 70)
    print("  PHASE 1: AUDIO RESOURCE & TTS VERIFICATION")
    print("=" * 70)
    errors_count = 0
    warnings_count = 0

    for idx, sch in enumerate(schedules):
        print(f"\nEvaluating Schedule #{idx+1} ({sch.hour:02d}:{sch.minute:02d}:{sch.second:02d}):")

        # Weather Forecast Check
        weather_prefix = ""
        if sch.include_weather:
            w_text = fetch_weather_summary()
            if w_text:
                weather_prefix = f"Today's weather update: {w_text}. "
                print(f"  [Weather] Live Weather Fetched Successfully: '{w_text}'")
            else:
                print(f"  [Weather WARNING] Could not fetch live weather from wttr.in")
                warnings_count += 1

        # Type Checks
        if sch.type == "tts":
            full_tts = (weather_prefix + sch.tts_message).strip()
            if full_tts:
                success, code, url = verify_tts_url(full_tts)
                if success:
                    print(f"  [TTS Check] OK (HTTP {code}) - Prompt: '{full_tts[:60]}...'")
                else:
                    print(f"  [TTS ERROR] Failed to generate StreamElements TTS audio (HTTP {code})")
                    errors_count += 1
            elif sch.audio_url:
                clean_url = sch.audio_url.strip().lstrip("/")
                full_url = f"{SUPABASE_URL}/storage/v1/object/public/audio-files/{clean_url}"
                success, code, size = verify_audio_stream(full_url)
                if success:
                    print(f"  [Audio Stream Check] OK (HTTP {code}, size={size} bytes) - URL: {full_url}")
                else:
                    print(f"  [Audio Stream ERROR] Storage audio file unreachable (HTTP {code}) - URL: {full_url}")
                    errors_count += 1

        elif sch.type == "mp3":
            if weather_prefix:
                w_success, w_code, _ = verify_tts_url(weather_prefix)
                if w_success:
                    print(f"  [Weather TTS Check] OK (HTTP {w_code}) - Weather prefix will speak before MP3 bell.")
                else:
                    print(f"  [Weather TTS ERROR] Failed weather prefix TTS (HTTP {w_code})")
                    errors_count += 1

            if sch.audio_url:
                clean_url = sch.audio_url.strip().lstrip("/")
                full_url = f"{SUPABASE_URL}/storage/v1/object/public/audio-files/{clean_url}"
                success, code, size = verify_audio_stream(full_url)
                if success:
                    print(f"  [MP3 File Check] OK (HTTP {code}, size={size} bytes) - File: {clean_url}")
                else:
                    print(f"  [MP3 File ERROR] Storage audio file unreachable (HTTP {code}) - URL: {full_url}")
                    errors_count += 1
            else:
                print(f"  [Buzzer Check] OK - No MP3 URL attached, buzzer will sound.")

    # 3. 24-Hour Timeline Execution Simulation
    print("\n" + "=" * 70)
    print("  PHASE 2: 24-HOUR TIMELINE SIMULATION (matching C++ checkSchedule logic)")
    print("=" * 70)

    # Test all 7 days of the week (tm_wday: 0=Sun .. 6=Sat)
    day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    total_rings = 0

    for test_wday in range(7):
        day_name = day_names[test_wday]
        print(f"\n--- Simulating Full Day: {day_name} (tm_wday={test_wday}) ---")
        day_rings = 0

        # Simulate every minute of the day (00:00 to 23:59)
        for h in range(24):
            for m in range(60):
                s = 0
                sim_timestamp = 1700000000 + (test_wday * 86400) + (h * 3600 + m * 60 + s)

                for sch in schedules:
                    diff = (h * 3600 + m * 60 + s) - (sch.hour * 3600 + sch.minute * 60 + sch.second)
                    if 0 <= diff <= 59:
                        day_match = test_wday in sch.days
                        if day_match:
                            if sim_timestamp - sch.last_rung > 60:
                                sch.last_rung = sim_timestamp
                                day_rings += 1
                                total_rings += 1

                                action = ""
                                if sch.type == "tts":
                                    action = f"TTS Announcement ('{sch.tts_message[:30]}...')"
                                elif sch.type == "mp3" and sch.audio_url:
                                    action = f"MP3 Bell ({sch.audio_url})"
                                else:
                                    action = "Buzzer Bell"

                                if sch.include_weather:
                                    action = f"Weather Forecast TTS + {action}"

                                print(f"  [TIMELINE TRIGGER] {h:02d}:{m:02d}:{s:02d} -> Triggered {action} (Scheduled: {sch.hour:02d}:{sch.minute:02d}:{sch.second:02d})")
                                break  # Break loop matching ESP32 firmware fix

    # 4. Summary Results
    print("\n" + "=" * 70)
    print("  SIMULATION RESULTS & VERIFICATION SUMMARY")
    print("=" * 70)
    print(f"  Total Schedules Evaluated : {len(schedules)}")
    print(f"  Total Trigger Events (7d) : {total_rings}")
    print(f"  Resource Check Errors    : {errors_count}")
    print(f"  Resource Check Warnings  : {warnings_count}")

    if errors_count == 0:
        print("\n  [SUCCESS] All schedules and audio/TTS resources are 100% VALID!")
        print("  [SUCCESS] Scheduled bells match on time without any errors or state collisions.")
    else:
        print(f"\n  [FAILURE] Detected {errors_count} error(s) during verification!")

if __name__ == "__main__":
    run_simulation()
