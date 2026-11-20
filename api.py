import os
import re
from datetime import datetime, timezone

from flask import Flask, jsonify, render_template, send_from_directory
from netmiko import ConnectHandler


app = Flask(__name__)

ROUTER_DEVICE = {
    "device_type": "cisco_ios_telnet",
    "ip": os.getenv("ROUTER_HOST", "192.168.10.96"),
    "port": int(os.getenv("ROUTER_PORT", "32770")),
    "username": os.getenv("ROUTER_USERNAME", "admin"),
    "password": os.getenv("ROUTER_PASSWORD", "eve123"),
    "secret": os.getenv("ROUTER_SECRET", "eve123"),
}


def parse_interfaces(output):
    interfaces = []
    pattern = re.compile(
        r"^(?P<name>\S+)\s+(?P<ip>\S+)\s+\S+\s+\S+\s+"
        r"(?P<status>administratively down|down|up)\s+(?P<protocol>down|up)",
        re.IGNORECASE,
    )

    for line in output.splitlines():
        match = pattern.match(line.strip())
        if not match:
            continue
        interfaces.append({
            "name": match.group("name"),
            "ip": "unassigned" if match.group("ip").lower() == "unassigned" else match.group("ip"),
            "status": "down" if "down" in match.group("status").lower() else "up",
            "protocol": match.group("protocol").lower(),
            "rxMbps": 0,
            "txMbps": 0,
        })
    return interfaces


def parse_version(output):
    hostname_match = re.search(r"^(\S+)\s+uptime\s+is\b", output, re.MULTILINE | re.IGNORECASE)
    uptime_match = re.search(r"uptime\s+is\s+(.+?)(?:\r?$)", output, re.MULTILINE | re.IGNORECASE)
    hostname = hostname_match.group(1) if hostname_match else "Router"
    uptime = "Unknown"

    if uptime_match:
        uptime = uptime_match.group(1).strip()
        uptime = uptime.replace(" days", "d").replace(" day", "d")
        uptime = uptime.replace(" hours", "h").replace(" hour", "h")
        uptime = uptime.replace(" minutes", "m").replace(" minute", "m")
        uptime = uptime.replace(",", "").replace("  ", " ").strip()

    platform = "Cisco IOS"
    if "IOS XE" in output:
        platform = "Cisco IOS XE"
    elif "NX-OS" in output:
        platform = "Cisco NX-OS"
    return hostname, uptime, platform


def build_diagnostics(outputs):
    interface_output = outputs["show ip interface brief"]
    interfaces = parse_interfaces(interface_output)
    hostname, uptime, platform = parse_version(outputs["show version"])
    down_count = sum(
        1 for interface in interfaces
        if interface["status"] != "up" or interface["protocol"] != "up"
    )

    if down_count:
        interface_check = {
            "title": "Interface health",
            "status": "warning",
            "detail": f"{down_count} interface{'s' if down_count != 1 else ''} is down or not operational",
        }
    else:
        interface_check = {
            "title": "Interface health",
            "status": "ok",
            "detail": f"All {len(interfaces)} interfaces are operational",
        }

    route_output = outputs["show ip route"]
    route_ok = bool(route_output.strip()) and "Invalid input" not in route_output
    running_config_ok = bool(outputs["show running-config"].strip())

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "device": {
            "name": f"{hostname} · Core Router",
            "host": f"EVE-NG node · {platform}",
            "platform": platform,
        },
        "metrics": {
            "uptime": uptime,
            "latencyMs": 0,
        },
        "interfaces": interfaces,
        "diagnostics": [
            {"title": "Device reachable", "status": "ok", "detail": "Router responded to diagnostics"},
            interface_check,
            {
                "title": "Routing table",
                "status": "ok" if route_ok else "warning",
                "detail": "Routes are available" if route_ok else "Routing table output was unavailable",
            },
            {
                "title": "Configuration snapshot",
                "status": "ok" if running_config_ok else "warning",
                "detail": "Running configuration collected" if running_config_ok else "Running configuration was unavailable",
            },
        ],
        "latencyHistory": [],
        "commandOutputs": {
            "interfaces": interface_output,
            "version": outputs["show version"],
            "routes": route_output,
        },
    }


@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")


@app.route("/styles.css")
def styles():
    return send_from_directory(app.template_folder, "styles.css")


@app.route("/dashboard.js")
def dashboard_script():
    return send_from_directory(app.template_folder, "dashboard.js")


@app.route("/api/diagnostics", methods=["POST"])
def diagnostics_api():
    requested_commands = [
        "show running-config",
        "show ip interface brief",
        "show version",
        "show ip route",
    ]
    outputs = {}
    connection = None

    try:
        connection = ConnectHandler(**ROUTER_DEVICE)
        connection.enable()
        for command in requested_commands:
            outputs[command] = connection.send_command(command)
        connection.disconnect()
        connection = None
        return jsonify(build_diagnostics(outputs))
    except Exception as exc:
        if connection is not None:
            try:
                connection.disconnect()
            except Exception:
                pass
        return jsonify({"error": f"Connection failed: {exc}"}), 502


if __name__ == "__main__":
    app.run(debug=True)
