import requests
from requests.cookies import RequestsCookieJar
from bs4 import BeautifulSoup
import re
import time

class Kid:
    def __init__(self, name, id):
        self.name = name
        self.id = id

class Stunde:
    def __init__(self, fach,raum, lehrerKuerzel):
        self.fach = fach
        self.raum = raum
        self.lehrerKuerzel = lehrerKuerzel

class SchoolInfo:
    def __init__(self, key, value):
        self.key = key
        self.value = value

class ElternPortalApiClientConfig:
    def __init__(self, short, username, password):
        self.short = short
        self.username = username
        self.password = password

class ElternPortalApiClient:
    def __init__(self, config: ElternPortalApiClientConfig):
        self.short = config.short
        self.username = config.username
        self.password = config.password
        self.csrf = ""
        self.jar = RequestsCookieJar()
        self.client = requests.Session()
        self.client.cookies = self.jar

    def init(self):
        response = self.client.get(f"https://{self.short}.eltern-portal.org/")
        soup = BeautifulSoup(response.text, 'html.parser')
        self.csrf = soup.find('input', {'name': 'csrf'})['value']

    def get_kids(self):
        response = self.client.post(
            f"https://{self.short}.eltern-portal.org/includes/project/auth/login.php",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "csrf": self.csrf,
                "username": self.username,
                "password": self.password,
                "go_to": ""
            }
        )
        soup = BeautifulSoup(response.text, 'html.parser')
        kid_name = soup.select('.pupil-selector select option')#.text.strip()
        kid_id = soup.select('.pupil-selector select option')#['value'])
        kids = []
        for i in range(len(kid_name)):
            kid = Kid(name=kid_name[i].text.strip(), id=int(kid_id[i]['value']))
            kids.append(kid)
        return kids


    def get_vertretungsplan(self):
        return 0
    
    def get_school_infos(self):
        response = self.client.post(
            f"https://{self.short}.eltern-portal.org/includes/project/auth/login.php",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "csrf": self.csrf,
                "username": self.username,
                "password": self.password,
                "go_to": "service/schulinformationen"
            }
        )
        soup = BeautifulSoup(response.text, 'html.parser')
        soup.select("table, .hidden-lg").clear()
        infos_html = soup.select_one("#asam_content").decode_contents().replace('\n', '<br>')
        infos_soup = BeautifulSoup(infos_html, 'html.parser')
        school_infos = [
            SchoolInfo(key=ele.select_one(".col-md-4").text, value=ele.select_one(".col-md-6").decode_contents())
            for ele in infos_soup.select(".row")
        ]
        return school_infos

    def get_termine(self, from_timestamp=0, to_timestamp=0):
        now = int(time.time() * 1000)
        self.client.post(
            f"https://{self.short}.eltern-portal.org/includes/project/auth/login.php",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "csrf": self.csrf,
                "username": self.username,
                "password": self.password,
                "go_to": "service/termine"
            }
        )
        utc_offset = -time.timezone // 60
        param_from = from_timestamp if from_timestamp else now
        param_to = to_timestamp if to_timestamp else now + 1000 * 60 * 60 * 24 * 90

        if len(str(param_from)) != 13:
            param_from = int(str(param_from).ljust(13, '0'))
        if len(str(param_to)) != 13:
            param_to = int(str(param_to).ljust(13, '0'))

        response = self.client.get(
            f"https://{self.short}.eltern-portal.org/api/ws_get_termine.php",
            params={"from": param_from, "to": param_to, "utc_offset": utc_offset}
        )
        data = response.json()
        if data['success'] == 1:
            for t in data['result']:
                t['title'] = t['title'].replace('<br />', '<br>').replace('<br>', '\n')
                t['title_short'] = t['title_short'].replace('<br />', '<br>').replace('<br>', '\n')
                t['start'] = int(t['start'])
                t['end'] = int(t['end'])
                t['bo_end'] = int(t['bo_end'])
                t['id'] = int(t['id'].replace('id_', ''))
            data['result'] = [t for t in data['result'] if t['start'] >= param_from and t['end'] <= param_to]
            return data['result']
        return []

    def get_stundenplan(self):
        response = self.client.post(
            f"https://{self.short}.eltern-portal.org/includes/project/auth/login.php",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "csrf": self.csrf,
                "username": self.username,
                "password": self.password,
                "go_to": "service/stundenplan"
            }
        )
        soup = BeautifulSoup(response.text, 'html.parser')
        cells = soup.select("#asam_content > div > table > tr td")
        std = 0
        tag =0
        tage= [[Stunde("",0,"") for x in range(3)] for y in range(5)] 
        for cell in cells[6:]:
            cell_html = cell.decode_contents()
            arr1 = cell_html.split('<br>')
            try:
                if not 'width="15%"' in str(cell):
                    tag+=1
                    fach = arr1[0].split('>')[1]
                    raum = arr1[1].split('<')[0]
                    if std < 4:
                        tage[tag-1][std-1]=(Stunde(fach=fach,raum=raum,lehrerKuerzel=''))
                    elif fach!="":
                        tage[tag-1].append(Stunde(fach=fach,raum=raum,lehrerKuerzel=''))
                else:
                    std+=1
                    tag =0
            except:
                pass
        return tage

    def get_fundsachen(self):
        response = self.client.post(
            f"https://{self.short}.eltern-portal.org/includes/project/auth/login.php",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "csrf": self.csrf,
                "username": self.username,
                "password": self.password,
                "go_to": "suche/fundsachen"
            }
        )
        soup = BeautifulSoup(response.text, 'html.parser')
        soup.select("table, .hidden-lg").clear()
        fundsachen_html = soup.select_one("#asam_content").decode_contents().replace('\n', '<br>')
        fundsachen_soup = BeautifulSoup(fundsachen_html, 'html.parser')
        fundsachen = [ele.select_one(".caption").text for ele in fundsachen_soup.select(".row")]
        return [f for f in fundsachen if f.strip()]

    def get_elternbriefe(self):
        response = self.client.post(
            f"https://{self.short}.eltern-portal.org/includes/project/auth/login.php",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "csrf": self.csrf,
                "username": self.username,
                "password": self.password,
                "go_to": "aktuelles/elternbriefe"
            }
        )
        soup = BeautifulSoup(response.text, 'html.parser')
        soup.select(".hidden-lg").clear()
        rows = soup.select("tr")
        briefe = []
        for i in range(0, len(rows), 2):
            row = rows[i]
            next_row = rows[i + 1]
            title = next_row.select_one("td:first-child a h4").text
            message_text = next_row.select_one("td:first-child").get_text(strip=True, separator="\n").replace(title, "")
            classes = next_row.select_one("span[style='font-size: 8pt;']").text.replace("Klasse/n: ", "")
            link = next_row.select_one("td:first-child a")['href']
            date = next_row.select_one("td:first-child a").text.replace(f"{title} ", "")
            info = next_row.select_one("td:last-child").text
            status = "unread" if "noch nicht" in row.select_one("td:last-child").decode_contents() else "read"
            briefe.append({
                "id": int(row.select_one("td:first-child").decode_contents().replace("#", "")),
                "status": status,
                "title": title,
                "message_text": message_text,
                "classes": classes,
                "date": date,
                "link": link,
                "info": info
            })
        return briefe

    def get_file(self, file=""):
        self.client.post(
            f"https://{self.short}.eltern-portal.org/includes/project/auth/login.php",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "csrf": self.csrf,
                "username": self.username,
                "password": self.password,
                "go_to": "aktuelles/elternbriefe"
            }
        )
        # res = self.client.get(f"https://{self.short}.eltern-portal.org/aktuelles/get_file/?repo={file}&csrf={self.csrf}", stream=True)
        # with open("./out.pdf", 'wb') as f:
        #     f.write(res.content)
        return {}
    def logout(self):
        self.client.get(f"https://{self.short}.eltern-portal.org/logout")
        
    def restart(self):
        self.logout()
        self.init()

async def get_elternportal_client(config: ElternPortalApiClientConfig):
    client = ElternPortalApiClient(config)
    client.init()
    return client