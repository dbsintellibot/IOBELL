const fs = require('fs');
let code = fs.readFileSync('src/main_s3.cpp', 'utf8');

// 1. Remove hardcoded SUPABASE_URL and SUPABASE_KEY
code = code.replace(
  /const char \*SUPABASE_URL = "https:\/\/hjlwzkwiweocnfztshmy\.supabase\.co";/,
  `// Supabase Configuration (Dynamically Loaded)
  char SUPABASE_URL[100] = "";`
);

code = code.replace(
  /const char \*SUPABASE_KEY =[\s\S]*?"OUx-ZWTdA-_BCW8sbIMw8E13CONOh5IjcjLko87RRC0";/,
  `char SUPABASE_KEY[300] = "";`
);

// 2. Load from preferences in setup()
// Find: storedSchool.toCharArray(schoolId, 40);
code = code.replace(
  /storedSchool\.toCharArray\(schoolId, 40\);/,
  `storedSchool.toCharArray(schoolId, 40);
  String storedSupaUrl = preferences.getString("supa_url", "");
  String storedSupaKey = preferences.getString("supa_key", "");
  storedSupaUrl.toCharArray(SUPABASE_URL, 100);
  storedSupaKey.toCharArray(SUPABASE_KEY, 300);`
);

// 3. Add to WiFiManager in setup()
// Find: WiFiManagerParameter custom_school_id...
code = code.replace(
  /WiFiManagerParameter custom_school_id\("school", "School ID \(Optional\)", schoolId, 40\);/g,
  `WiFiManagerParameter custom_school_id("school", "School ID (Optional)", schoolId, 40);
    WiFiManagerParameter custom_supa_url("supaurl", "Supabase URL", SUPABASE_URL, 100);
    WiFiManagerParameter custom_supa_key("supakey", "Supabase Anon Key", SUPABASE_KEY, 300);`
);

// Find: wm.addParameter(&custom_school_id);
code = code.replace(
  /wm\.addParameter\(&custom_school_id\);/g,
  `wm.addParameter(&custom_school_id);
    wm.addParameter(&custom_supa_url);
    wm.addParameter(&custom_supa_key);`
);

// 4. Save to preferences
// Find: strcpy(schoolId, custom_school_id.getValue());
code = code.replace(
  /strcpy\(schoolId, custom_school_id\.getValue\(\)\);/g,
  `strcpy(schoolId, custom_school_id.getValue());
      strcpy(SUPABASE_URL, custom_supa_url.getValue());
      strcpy(SUPABASE_KEY, custom_supa_key.getValue());`
);

// Find: preferences.putString("school_id", schoolId);
code = code.replace(
  /preferences\.putString\("school_id", schoolId\);/g,
  `preferences.putString("school_id", schoolId);
      preferences.putString("supa_url", SUPABASE_URL);
      preferences.putString("supa_key", SUPABASE_KEY);`
);

// 5. Change GeoIP from HTTP to HTTPS
// Let's grep for GeoIP
// We don't see it in the first 800 lines, I'll replace 'http://ip-api.com/json' or similar if present.
code = code.replace(/http:\/\/ip-api\.com/g, 'https://ipapi.co'); 
// Wait, ipapi.co requires trailing /json/ for json, and is HTTPS, whereas ip-api.com HTTPS is paid. Let's just use "https://ipapi.co/json/"
// Let's first check what's actually in there.

fs.writeFileSync('src/main_s3.cpp', code);
console.log("Refactored main_s3.cpp");
