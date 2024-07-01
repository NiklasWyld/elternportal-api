# @philippdormann/elternportal-api
🔌 unofficial APIs for connecting to `*.eltern-portal.org` URLs/ infoportal by art soft and more GmbH

## Installation
```bash
pnpm i @philippdormann/elternportal-api
```
## Usage
```js
import { getElternportalClient } from "@philippdormann/elternportal-api";

const client = await getElternportalClient({
  short: "heraugy",
  username: "",
  password: "",
});
const letters = await client.getElternbriefe();
console.log(letters);
```

# Python extension from NiklasWyld

## Usage
```py
from api import ElternPortalApiClient, ElternPortalApiClientConfig


config = ElternPortalApiClientConfig(
    short="heraugy",
    username="",
    password=""
)

client = ElternPortalApiClient(config)
client.init()

print(client.get_kids()[0].name)
````
