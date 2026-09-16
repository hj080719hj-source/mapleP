"""Developer-only snapshot updater. Requires requests and beautifulsoup4.
The deployed calculator never calls Nexon and requires no API key.
"""
import datetime
import sys
import json
from pathlib import Path
import requests
from bs4 import BeautifulSoup

BASE = 'https://maplestory.nexon.com'
additional = '--additional' in sys.argv
cube_id = 5062500 if additional else 5062010
PAGE = BASE + '/Guide/OtherProbability/cube/' + ('addi' if additional else 'black')
ENDPOINT = BASE + '/Guide/OtherProbability/cube/GetSearchProbList'
root = Path(__file__).resolve().parents[1]
session = requests.Session()
session.get(PAGE, timeout=30).raise_for_status()
records = {}
missing = []
for part in [1,3,6,7,9,10,11,12,13,14,15,16,17,18,19,20]:
    for level in [140,145,150,160,200,250]:
        response = session.post(ENDPOINT,
            headers={'X-Requested-With': 'XMLHttpRequest', 'Referer': PAGE},
            data={'nCubeItemID': cube_id, 'nGrade': 4, 'nPartsType': part, 'nReqLev': level},
            timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')
        tables = soup.select('table.cube_data')
        if len(tables) != 3:
            missing.append(f'{part}-{level}')
            print(f'Unavailable {part}/{level}', flush=True)
            continue
        lines = []
        for table in tables:
            options = []
            for row in table.select('tbody tr'):
                cells = row.find_all('td')
                if len(cells) == 2:
                    options.append({'name': cells[0].get_text(' ', strip=True),
                                    'probability': float(cells[1].get_text(strip=True).rstrip('%')) / 100})
            total = sum(x['probability'] for x in options)
            if not 0.999 < total < 1.001:
                raise ValueError(f'Invalid probability sum: {part}/{level}: {total}')
            lines.append(options)
        records[f'{part}-{level}'] = lines
        print(f'Fetched {part}/{level}', flush=True)
payload = {'retrievedAt': datetime.date.today().isoformat(), 'source': PAGE, 'unavailable': missing,
           'endpoint': ENDPOINT, 'cubeItemId': cube_id, 'grade': 4, 'tables': records}
target = root / 'public' / 'data' / ('additional.json' if additional else 'potential.json')
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
