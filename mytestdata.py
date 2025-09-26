import requests
from bs4 import BeautifulSoup
import time
import os

stations = {
    "06260": "De Bilt",
    "06447": "Brussels",
    # Add more stations here...
}

base_url = "https://www.ogimet.com/display_sond.php"

params = {
    "lang": "en",
    "tipo": "ALL",
    "ord": "DIR",
    "nil": "NO",
    "fmt": "txt",
    "ano": "2025",
    "mes": "07",
    "day": "02",
    "hora": "12",
    "anof": "2025",
    "mesf": "07",
    "dayf": "03",
    "horaf": "07",
    "send": "send"
}

headers = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/90.0.4430.212 Safari/537.36"
    )
}

session = requests.Session()

output_dir = "soundings_txt"
os.makedirs(output_dir, exist_ok=True)

for lugar, name in stations.items():
    print(f"Fetching sounding data for {name} ({lugar})")
    params["lugar"] = lugar

    try:
        response = session.get(base_url, params=params, headers=headers, timeout=20)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        pre_tag = soup.find("pre")
        if not pre_tag:
            print(f"Warning: No <pre> tag found for {name}. Saving full HTML instead.")
            text_data = response.text
        else:
            text_data = pre_tag.get_text()

        filename = (
            f"{output_dir}/{name.replace(' ', '_')}_"
            f"{params['ano']}{params['mes']}{params['day']}_{params['hora']}_"
            f"to_{params['anof']}{params['mesf']}{params['dayf']}_{params['horaf']}.txt"
        )

        with open(filename, "w", encoding="utf-8") as f:
            f.write(text_data)

        print(f"Saved sounding text to {filename}")
        time.sleep(2)

    except Exception as e:
        print(f"Failed to fetch {name}: {e}")

print("All done.")
