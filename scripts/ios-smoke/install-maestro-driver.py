"""Register the verified official XCTest apps before Xcode test-without-building.

Xcode 26.3 can otherwise reject the runner as unknown to FrontBoard. This uses
Maestro 2.11.0's own driver-iPhoneSimulator products, never rebuilds the tested app,
and leaves Maestro's normal XCTest execution and all acceptance gates intact.
"""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import subprocess
import sys
import zipfile

cli_root = Path(sys.argv[1])
products = Path(sys.argv[2])
device = os.environ["DEVICE_ID"]
resources = []
for jar in cli_root.rglob("*.jar"):
    with zipfile.ZipFile(jar) as archive:
        members = [entry for entry in archive.infolist()
                   if entry.filename.startswith("driver-iPhoneSimulator/") and not entry.is_dir()]
        if not members:
            continue
        if resources:
            raise RuntimeError("Multiple official simulator driver resources were found")
        for member in members:
            relative = PurePosixPath(member.filename)
            if ".." in relative.parts or relative.is_absolute():
                raise RuntimeError("Unsafe official driver resource path")
            destination = products.joinpath(*relative.parts)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(archive.read(member))
            permissions = (member.external_attr >> 16) & 0o777
            if permissions:
                destination.chmod(permissions)
        resources = [{"jar": str(jar), "members": len(members)}]
if not resources:
    raise RuntimeError("Pinned Maestro package contains no simulator driver products")
for name in ("maestro-driver-iosUITests-Runner.zip", "maestro-driver-ios.zip"):
    for archive in products.rglob(name):
        subprocess.run(["ditto", "-x", "-k", str(archive), str(archive.parent)], check=True)
records = []
for name in ("maestro-driver-ios.app", "maestro-driver-iosUITests-Runner.app"):
    candidates = list(products.rglob(name))
    if len(candidates) != 1:
        raise RuntimeError(f"Expected exactly one official {name}")
    app = candidates[0]
    info = plistlib.loads((app / "Info.plist").read_bytes())
    bundle_id = info["CFBundleIdentifier"]
    executable = app / info["CFBundleExecutable"]
    subprocess.run(["xcrun", "simctl", "install", device, str(app)], check=True)
    container = subprocess.run(["xcrun", "simctl", "get_app_container", device, bundle_id, "app"],
                               check=True, capture_output=True, text=True).stdout.strip()
    records.append({"bundleId": bundle_id, "installedContainer": container,
                    "executableSha256": hashlib.sha256(executable.read_bytes()).hexdigest()})
if "dev.mobile.maestro-driver-iosUITests.xctrunner" not in {record["bundleId"] for record in records}:
    raise RuntimeError("The required genuine Maestro XCTest runner was not installed")
registry = subprocess.run(["xcrun", "simctl", "listapps", device],
                          check=True, capture_output=True).stdout
registered = json.loads(subprocess.run(["plutil", "-convert", "json", "-o", "-", "-"],
                                      input=registry, check=True, capture_output=True).stdout)
if not all(record["bundleId"] in registered for record in records):
    raise RuntimeError("Installed official driver apps are not registered with Simulator")
report = {"officialPackageSha256": "5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a",
          "resources": resources, "installedApps": records, "applicationRebuilt": False}
Path("out/ios-smoke/maestro-driver-install.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
