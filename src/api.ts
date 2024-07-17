import express from 'express';
import { load as cheerioLoad } from 'cheerio';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { Cookie, CookieJar } from 'tough-cookie';

/* SERVER */

type Kid = {
  name: string;
  id: number;
};
type SchoolInfo = {
  key: string;
  value: string;
};
type ElternPortalApiClientConfig = {
  short: string;
  username: string;
  password: string;
};
// =========
async function getElternportalClient(config: ElternPortalApiClientConfig) {
  const apiclient = new ElternPortalApiClient(config);
  await apiclient.init();
  return apiclient;
}
class ElternPortalApiClient {
  jar: CookieJar;
  client: AxiosInstance;
  short: string = "";
  username: string = "";
  password: string = "";
  csrf: string = "";
  constructor(config: ElternPortalApiClientConfig) {
    this.short = config.short;
    this.username = config.username;
    this.password = config.password;
    //
    this.jar = new CookieJar();
    this.client = wrapper(axios.create({ jar: this.jar }));
  }
  async init() {
    const { data } = await this.client.request({
      method: "GET",
      url: `https://${this.short}.eltern-portal.org/`,
    });
    const $ = cheerioLoad(data);
    const parsedCSRFToken = $(`[name='csrf']`).val() as string;
    this.csrf = parsedCSRFToken;
  }
  async prove_auth(): Promise<boolean> {
    try {
      const { data } = await this.client.request({
        method: "POST",
        url: `https://${this.short}.eltern-portal.org/includes/project/auth/login.php`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        data: {
          csrf: this.csrf,
          username: this.username,
          password: this.password,
          go_to: "",
        },
      });

      const $ = cheerioLoad(data);
      const kids = $(`.pupil-selector select option`).length;
      
      if (kids > 0) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error("Authentication failed:", error);
      return false;
    }
  }
  async getKids(): Promise<Kid[]> {
    const { data } = await this.client.request({
      method: "POST",
      url: `https://${this.short}.eltern-portal.org/includes/project/auth/login.php`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: {
        csrf: this.csrf,
        username: this.username,
        password: this.password,
        go_to: "",
      },
    });
    const $ = cheerioLoad(data);
    const kids = [
      {
        name: $(`.pupil-selector select option`)
          .text()
          .replace(/^\s+|\s+$/g, ""),
        id: parseInt($(`.pupil-selector select option`).val() as string),
      },
    ];
    return kids;
  }
  async getSchoolInfos(): Promise<SchoolInfo[]> {
    const { data } = await this.client.request({
      method: "POST",
      url: `https://${this.short}.eltern-portal.org/includes/project/auth/login.php`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: {
        csrf: this.csrf,
        username: this.username,
        password: this.password,
        go_to: "service/schulinformationen",
      },
    });
    const $ = cheerioLoad(data);
    $("table").remove();
    $(".hidden-lg").remove();
    let infos =
      ($("#asam_content").html() as string) || "".replaceAll(`\n`, "<br>");
    const schoolInfos = cheerioLoad(infos)(".row")
      .get()
      .map((ele) => {
        return {
          key: $(ele).find(".col-md-4").text(),
          value: $(ele).find(".col-md-6").html() as string,
        };
      });
    return schoolInfos;
  }
  async getTermine(from = 0, to = 0) {
    const now = Date.now();
    await this.client.request({
      method: "POST",
      url: `https://${this.short}.eltern-portal.org/includes/project/auth/login.php`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: {
        csrf: this.csrf,
        username: this.username,
        password: this.password,
        go_to: "service/termine",
      },
    });
    const utc_offset = new Date().getTimezoneOffset();
    let param__from = from;
    if (param__from === 0) {
      param__from = now;
    }
    let param__to = to;
    if (param__to === 0) {
      param__to = now + 1000 * 60 * 60 * 24 * 90;
    }
    //
    if (`${from}`.length !== 13) {
      param__from = parseInt(`${param__from}`.padEnd(13, "0"));
    }
    if (`${to}`.length !== 13) {
      param__to = parseInt(`${param__to}`.padEnd(13, "0"));
    }
    const { data } = await this.client.request({
      method: "GET",
      url: `https://${this.short}.eltern-portal.org/api/ws_get_termine.php`,
      params: { from: param__from, to: param__to, utc_offset },
    });
    if (data.success === 1) {
      data.result = data.result.map((t: any) => {
        t.title = t.title.replaceAll("<br />", "<br>").replaceAll("<br>", "\n");
        t.title_short = t.title_short
          .replaceAll("<br />", "<br>")
          .replaceAll("<br>", "\n");
        t.start = parseInt(t.start);
        t.end = parseInt(t.end);
        t.bo_end = parseInt(t.bo_end);
        t.id = parseInt(t.id.replace("id_", ""));
        return t;
      });
      data.result = data.result.filter((t: any) => t.start >= param__from);
      data.result = data.result.filter((t: any) => t.end <= param__to);
      return data.result;
    }
    return [];
  }
  async getStundenplan() {
    const { data } = await this.client.request({
      method: "POST",
      url: `https://${this.short}.eltern-portal.org/includes/project/auth/login.php`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: {
        csrf: this.csrf,
        username: this.username,
        password: this.password,
        go_to: "service/stundenplan",
      },
    });
    const tmp = cheerioLoad(data)(
      "#asam_content > div > table > tbody tr td"
    ).get();
    // @ts-ignore
    let rows = [];
    let std = 0;
    tmp.forEach((r) => {
      const rowsDOM = cheerioLoad(r)("td").get();
      // @ts-ignore
      let cols = [];
      rowsDOM.forEach((t) => {
        const rowHTML = cheerioLoad(t).html();
        if (rowHTML.includes('width="15%"')) {
          const arr1 = (rowHTML || "").split("<br>");
          const value = parseInt(
            (arr1[0] || "").split(">")[1].replace(".", "")
          );
          std = value;
          // const value = std
          const detail = (arr1[1] || "").split("<")[0].replaceAll(".", ":");
          rows.push({ type: "info", value, detail, std });
        } else {
          const arr1 = (rowHTML || "").split("<br>");
          const value = (arr1[0] || "").split('<span class="">')[1];
          const detail = (arr1[1] || "").split(" </span>")[0];
          rows.push({ type: "class", value, detail, std });
        }
        // std++
      });
      // @ts-ignore
      // @ts-ignore
      // rows.push(cols);
    });
    // @ts-ignore
    rows = rows.filter((r) => r.std !== null);
    // rows = rows.filter(r => r.std === null)
    // @ts-ignore
    return rows;
  }
  async getFundsachen(): Promise<string[]> {
    const { data } = await this.client.request({
      method: "POST",
      url: `https://${this.short}.eltern-portal.org/includes/project/auth/login.php`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: {
        csrf: this.csrf,
        username: this.username,
        password: this.password,
        go_to: "suche/fundsachen",
      },
    });
    const $ = cheerioLoad(data);
    $("table").remove();
    $(".hidden-lg").remove();
    let fundsachenhtml = ($("#asam_content").html() as string).replaceAll(
      `\n`,
      "<br>"
    );
    const fundsachen = cheerioLoad(fundsachenhtml)(".row")
      .get()
      .map((ele: any) => {
        return $(ele).find(".caption").text();
      })
      .filter((f) => f.trim());
    return fundsachen;
  }
  async getElternbriefe() {
    const { data } = await this.client.request({
      method: "POST",
      url: `https://${this.short}.eltern-portal.org/includes/project/auth/login.php`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: {
        csrf: this.csrf,
        username: this.username,
        password: this.password,
        go_to: "aktuelles/elternbriefe",
      },
    });
    const $ = cheerioLoad(data);
    $(".hidden-lg").remove();
    let tmp = $("tr")
      .get()
      .map((ele) => {
        if (($(ele).find("td:first").html() as string).includes("<h4>")) {
          const title = $(ele).find("td:first a h4").text();
          $(ele).remove("h4");
          const messageText = $(ele)
            .find("td:first")
            .clone()
            .children()
            .remove()
            .end()
            .text()
            .trim();
          const classes = $(ele)
            .find("span[style='font-size: 8pt;']")
            .text()
            .replace("Klasse/n: ", "");
          const link = $(ele).find("td:first a").attr("href");
          const date = $(ele)
            .find("td:first a")
            .text()
            .replace(`${title} `, "");
          $(ele).remove("a");
          return {
            title,
            messageText,
            classes,
            link,
            date,
            info: $(ele).find("td:last").text(),
          };
        }
        const statusOriginal = $(ele).find("td:last").html() as string;
        let status = "read";
        if (statusOriginal.includes("noch nicht")) {
          status = "unread";
        }
        return {
          id: $(ele).find("td:first").html(),
          status,
        };
      });
    let briefe = [];
    for (let index = 0; index < tmp.length; index += 2) {
      briefe.push({
        id: parseInt((tmp[index].id as string).replace("#", "")),
        status: tmp[index].status,
        title: tmp[index + 1].title,
        messageText: tmp[index + 1].messageText,
        classes: tmp[index + 1].classes ?? "",
        date: tmp[index + 1].date,
        link: tmp[index + 1].link,
      });
    }
    return briefe;
  }

  async getFile(file = "") {
    await this.client.request({
      method: "POST",
      url: `https://${this.short}.eltern-portal.org/includes/project/auth/login.php`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: {
        csrf: this.csrf,
        username: this.username,
        password: this.password,
        go_to: "aktuelles/elternbriefe",
      },
    });
    // const res = await client.get(`https://${this.short}.eltern-portal.org/aktuelles/get_file/?repo=${file}&csrf=${csrf}`, { responseType: 'arraybuffer' });
    // writeFileSync("./out.pdf", res.data);
    return {};
  }
}


/* API */


const app = express();
const PORT = process.env.PORT || 3000;

app.get('/auth', async (req, res) => {
  try {
    const { short, username, password } = req.query;
    const config = { short, username, password } as ElternPortalApiClientConfig;
    const client = await getElternportalClient(config);
    res.status(200).send({ message: 'Client initialized successfully', csrf: client.csrf });
  } catch (error) {
    res.status(500).send({ error: (error as any).message });
  }
});

app.get('/get_auth', async (req, res) => {
  try {
    const {short, username, password} = req.query;
    const config = { short, username, password } as ElternPortalApiClientConfig;
    const client = await getElternportalClient(config);
    const auth_status = await client.prove_auth();
    res.status(200).send(auth_status);
  } catch (error) {
    res.status(500).send({ error: (error as any).message });
  }
})

app.get('/kids', async (req, res) => {
  try {
    const { short, username, password } = req.query;
    const config = { short, username, password } as ElternPortalApiClientConfig;
    const client = await getElternportalClient(config);
    const kids = await client.getKids();
    res.status(200).send(kids);
  } catch (error) {
    res.status(500).send({ error: (error as any).message });
  }
});

app.get('/schoolinfos', async (req, res) => {
  try {
    const { short, username, password } = req.query;
    const config = { short, username, password } as ElternPortalApiClientConfig;
    const client = await getElternportalClient(config);
    const schoolInfos = await client.getSchoolInfos();
    res.status(200).send(schoolInfos);
  } catch (error) {
    res.status(500).send({ error: (error as any).message });
  }
});

app.get('/termine', async (req, res) => {
  try {
    const { short, username, password, from, to } = req.query;
    const config = { short, username, password } as ElternPortalApiClientConfig;
    const client = await getElternportalClient(config);
    const termine = await client.getTermine(Number(from), Number(to));
    res.status(200).send(termine);
  } catch (error) {
    res.status(500).send({ error: (error as any).message });
  }
});

app.get('/stundenplan', async (req, res) => {
  try {
    const { short, username, password } = req.query;
    const config = { short, username, password } as ElternPortalApiClientConfig;
    const client = await getElternportalClient(config);
    const stundenplan = await client.getStundenplan();
    res.status(200).send(stundenplan);
  } catch (error) {
    res.status(500).send({ error: (error as any).message });
  }
});

app.get('/fundsachen', async (req, res) => {
  try {
    const { short, username, password } = req.query;
    const config = { short, username, password } as ElternPortalApiClientConfig;
    const client = await getElternportalClient(config);
    const fundsachen = await client.getFundsachen();
    res.status(200).send(fundsachen);
  } catch (error) {
    res.status(500).send({ error: (error as any).message });
  }
});

app.get('/elternbriefe', async (req, res) => {
  try {
    const { short, username, password } = req.query;
    const config = { short, username, password } as ElternPortalApiClientConfig;
    const client = await getElternportalClient(config);
    const elternbriefe = await client.getElternbriefe();
    res.status(200).send(elternbriefe);
  } catch (error) {
    res.status(500).send({ error: (error as any).message });
  }
});

app.get('/file', async (req, res) => {
  try {
    const { short, username, password, file } = req.query;
    const config = { short, username, password } as ElternPortalApiClientConfig;
    const client = await getElternportalClient(config);
    const fileData = await client.getFile(String(file));
    res.status(200).send(fileData);
  } catch (error) {
    res.status(500).send({ error: (error as any).message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
