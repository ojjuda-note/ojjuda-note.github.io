#!/usr/bin/env python3
"""Create native resources from the prepared 24 masters. No design generation or signing."""
import hashlib
import json
import shutil
import struct
import subprocess
from pathlib import Path
from xml.sax.saxutils import escape

PROJECT = Path(__file__).resolve().parents[1]
REPO = PROJECT.parent.parent
OUTPUT = PROJECT / 'app/build/generated/seasonal'
APPS = ('agit', 'park', 'pajang')
THEMES = ('spring', 'summer', 'autumn', 'winter', 'newyear', 'seollal', 'chuseok', 'christmas')
DENSITIES = (('mdpi', 48, 108), ('hdpi', 72, 162), ('xhdpi', 96, 216), ('xxhdpi', 144, 324), ('xxxhdpi', 192, 432))


def xml_string(value):
    # Android resource quoting preserves JSON quotation marks and Korean text literally.
    return '"' + escape(str(value)).replace('\\', '\\\\').replace('"', '\\"').replace("'", "\\'") + '"'


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')


def metadata(indent='      '):
    pairs = [
        ('android.support.customtabs.trusted.DEFAULT_URL', 'value', '@string/launchUrl'),
        ('android.support.customtabs.trusted.STATUS_BAR_COLOR', 'resource', '@color/colorPrimary'),
        ('android.support.customtabs.trusted.STATUS_BAR_COLOR_DARK', 'resource', '@color/colorPrimaryDark'),
        ('android.support.customtabs.trusted.NAVIGATION_BAR_COLOR', 'resource', '@color/navigationColor'),
        ('android.support.customtabs.trusted.NAVIGATION_BAR_COLOR_DARK', 'resource', '@color/navigationColorDark'),
        ('androix.browser.trusted.NAVIGATION_BAR_DIVIDER_COLOR', 'resource', '@color/navigationDividerColor'),
        ('androix.browser.trusted.NAVIGATION_BAR_DIVIDER_COLOR_DARK', 'resource', '@color/navigationDividerColorDark'),
        ('android.support.customtabs.trusted.SPLASH_IMAGE_DRAWABLE', 'resource', '@drawable/splash'),
        ('android.support.customtabs.trusted.SPLASH_SCREEN_BACKGROUND_COLOR', 'resource', '@color/backgroundColor'),
        ('android.support.customtabs.trusted.SPLASH_SCREEN_FADE_OUT_DURATION', 'value', '@integer/splashScreenFadeOutDuration'),
        ('android.support.customtabs.trusted.FILE_PROVIDER_AUTHORITY', 'value', '@string/providerAuthority'),
        ('android.support.customtabs.trusted.FALLBACK_STRATEGY', 'value', '@string/fallbackType'),
        ('android.support.customtabs.trusted.SCREEN_ORIENTATION', 'value', '@string/orientation'),
        ('android.support.customtabs.trusted.ADDITIONAL_TRUSTED_ORIGINS', 'resource', '@array/additional_trusted_origins'),
        ('android.app.shortcuts', 'resource', '@xml/shortcuts'),
    ]
    return '\n'.join(f'{indent}<meta-data android:name="{name}" android:{kind}="{value}" />' for name, kind, value in pairs)


def manifest():
    aliases = []
    for theme in THEMES:
        enabled = str(theme == 'summer').lower()
        aliases.append(f'''    <activity-alias android:name="${{applicationId}}.icon.{theme}"
        android:targetActivity="${{applicationId}}.LauncherActivity"
        android:enabled="{enabled}" android:exported="true"
        android:label="@string/launcherName" android:icon="@mipmap/icon_{theme}">
      <intent-filter><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent-filter>
{metadata()}
    </activity-alias>''')
    return '''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
  <queries><intent><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="https" /></intent></queries>
  <application android:name="${applicationId}.Application" android:allowBackup="true"
      android:extractNativeLibs="false" android:supportsRtl="true"
      android:icon="@mipmap/icon_summer" android:label="@string/appName"
      android:theme="@android:style/Theme.Translucent.NoTitleBar"
      android:manageSpaceActivity="com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity">
    <meta-data android:name="asset_statements" android:resource="@string/assetStatements" />
    <meta-data android:name="web_manifest_url" android:value="@string/webManifestUrl" />
    <meta-data android:name="twa_generator" android:value="@string/generatorApp" />
    <activity android:name="com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity"
        android:enabled="@bool/enableSiteSettingsShortcut" android:exported="false" android:excludeFromRecents="true">
      <meta-data android:name="android.support.customtabs.trusted.MANAGE_SPACE_URL" android:value="@string/launchUrl" />
      <intent-filter><action android:name="android.intent.action.APPLICATION_PREFERENCES" /><category android:name="android.intent.category.DEFAULT" /></intent-filter>
    </activity>
    <!-- Keep the old actual activity enabled for existing explicit/deep-link intents. -->
    <activity android:name="${applicationId}.LauncherActivity" android:exported="true"
        android:alwaysRetainTaskState="true" android:label="@string/launcherName">
''' + metadata() + '''
      <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" /><category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" android:host="ojjuda.com" />
      </intent-filter>
      <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" /><category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" android:host="ojjuda.kr" />
      </intent-filter>
    </activity>
''' + '\n'.join(aliases) + '''
    <activity android:name="com.google.androidbrowserhelper.trusted.FocusActivity" />
    <activity android:name="com.google.androidbrowserhelper.trusted.WebViewFallbackActivity" android:configChanges="orientation|screenSize" />
    <provider android:name="androidx.core.content.FileProvider" android:authorities="${applicationId}.fileprovider"
        android:exported="false" android:grantUriPermissions="true">
      <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/filepaths" />
    </provider>
    <service android:name="${applicationId}.DelegationService" android:enabled="@bool/enableNotification" android:exported="@bool/enableNotification">
      <intent-filter><action android:name="android.support.customtabs.trusted.TRUSTED_WEB_ACTIVITY_SERVICE" /><category android:name="android.intent.category.DEFAULT" /></intent-filter>
    </service>
    <service android:name="kr.ojjuda.shell.SeasonalIconJobService" android:exported="true" android:permission="android.permission.BIND_JOB_SERVICE" />
    <receiver android:name="kr.ojjuda.shell.SeasonalIconReceiver" android:exported="false">
      <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
        <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
        <action android:name="android.intent.action.TIME_SET" />
        <action android:name="android.intent.action.TIMEZONE_CHANGED" />
      </intent-filter>
    </receiver>
  </application>
</manifest>
'''


def prepare():
    magick = shutil.which('magick')
    if not magick:
        raise SystemExit('ImageMagick 7 (magick) is required; no placeholder icons will be used.')
    masters = {}
    for app in APPS:
        baseline = PROJECT / f'baselines/{app}.json'
        if not baseline.is_file():
            raise SystemExit(f'Missing verified original metadata: {baseline.name}')
        for theme in THEMES:
            source = REPO / f'brand/app-icons/seasonal/{app}/{theme}.png'
            if not source.is_file():
                raise SystemExit(f'Missing prepared master: {source.relative_to(REPO)}')
            data = source.read_bytes()
            if data[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack('>II', data[16:24]) != (1024, 1024):
                raise SystemExit(f'Master must be 1024×1024 PNG: {source.name}')
            opaque = subprocess.check_output([magick, 'identify', '-format', '%[opaque]', str(source)], text=True)
            if opaque.lower() != 'true':
                raise SystemExit(f'Master must be opaque: {source.name}')
            masters[(app, theme)] = source
    calendar_path = REPO / 'shared/app-icons/calendar.json'
    calendar = json.loads(calendar_path.read_text())
    if calendar.get('schemaVersion') != 1 or calendar.get('timezone') != 'Asia/Seoul' or set(calendar.get('themes', [])) != set(THEMES):
        raise SystemExit('Unsupported shared calendar')
    write(OUTPUT / 'main/AndroidManifest.xml', manifest())
    inventory = []
    for app in APPS:
        baseline = json.loads((PROJECT / f'baselines/{app}.json').read_text())
        if baseline['package'] != f'kr.ojjuda.{app}':
            raise SystemExit(f'Unexpected original package for {app}')
        res = OUTPUT / app / 'res'
        strings = dict(baseline['strings'])
        statements = [{'relation': ['delegate_permission/common.handle_all_urls'], 'target': {'namespace': 'web', 'site': origin}} for origin in ('https://ojjuda.com', 'https://ojjuda.kr')]
        strings['assetStatements'] = json.dumps(statements, ensure_ascii=False)
        strings['generatorApp'] = 'ojjuda-seasonal-reconstruction'
        entries = [f'  <string name="{key}" translatable="false">{xml_string(value)}</string>' for key, value in strings.items()]
        entries += [f'  <color name="{key}">{value}</color>' for key, value in baseline['colors'].items()]
        entries += [f'  <bool name="{key}">{str(value).lower()}</bool>' for key, value in baseline['booleans'].items()]
        entries += [f'  <integer name="{key}">{value}</integer>' for key, value in baseline['integers'].items()]
        entries.append('  <string-array name="additional_trusted_origins"><item>https://ojjuda.kr</item></string-array>')
        write(res / 'values/twa.xml', '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n' + '\n'.join(entries) + '\n</resources>\n')
        write(res / 'xml/filepaths.xml', '<paths xmlns:android="http://schemas.android.com/apk/res/android"><files-path name="twa_splash" path="twa_splash/" /></paths>\n')
        write(res / 'xml/shortcuts.xml', '<shortcuts xmlns:android="http://schemas.android.com/apk/res/android" />\n')
        write(res / 'raw/seasonal_icon_calendar.json', calendar_path.read_text())
        write(res / 'raw/web_app_manifest.json', json.dumps(baseline['webManifest'], ensure_ascii=False, indent=2) + '\n')
        for theme in THEMES:
            source = masters[(app, theme)]
            for density, legacy, adaptive in DENSITIES:
                for name, size, crop in [(f'icon_{theme}', legacy, True), (f'background_{theme}', adaptive, False)]:
                    destination = res / f'mipmap-{density}/{name}.png'
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    command = [magick, str(source)]
                    if crop:
                        command += ['-gravity', 'center', '-crop', '800x800+0+0', '+repage']
                    command += ['-filter', 'Lanczos', '-resize', f'{size}x{size}', '-strip', str(destination)]
                    subprocess.run(command, check=True)
                    inventory.append({'path': str(destination.relative_to(OUTPUT)), 'size': size, 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()})
            write(res / f'mipmap-anydpi-v26/icon_{theme}.xml', f'''<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@mipmap/background_{theme}" />
  <foreground android:drawable="@android:color/transparent" />
</adaptive-icon>
''')
        splash = res / 'drawable-nodpi/splash.png'
        splash.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([magick, str(masters[(app, 'summer')]), '-resize', '512x512', '-strip', str(splash)], check=True)
    write(OUTPUT / 'inventory.json', json.dumps(inventory, indent=2) + '\n')
    print(f'Prepared {len(inventory)} icon PNGs, 24 adaptive XMLs, and 3 bundled calendars. No signing performed.')


if __name__ == '__main__':
    prepare()
