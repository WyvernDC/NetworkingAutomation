from netmiko import ConnectHandler

router_device = {
    'device_type': 'cisco_ios_telnet',
    'host': '192.168.10.96',  # 'host' is preferred over 'ip' in newer Netmiko versions
    'port': 32770,
    'username': 'admin',
    'password': 'eve123',     # Added login password (update if different from secret)
    'secret': 'eve123'
}

try:
    print("Connecting to router...")
    net_connect = ConnectHandler(**router_device)

    net_connect.enable()

    commands_to_run = [
        "show version",
        "show ip interface brief",
        "show running-config",
        "show ip route"
    ]

    for cmd in commands_to_run:
        print(f"\n--- Output for: {cmd} ---")
        output = net_connect.send_command(cmd)
        print(output)

    net_connect.disconnect()
    print("\nDisconnected successfully.")

except Exception as e:
    print(f"Connection failed: {e}")
