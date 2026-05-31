# D&D Beyond Live-Update Campaign Page

![GitHub last commit](https://img.shields.io/github/last-commit/ductoman16/DnDBeyond-Live-Campaign?style=plastic&logo=github) ![GitHub repo size](https://img.shields.io/github/repo-size/ductoman16/DnDBeyond-Live-Campaign?style=plastic) ![GitHub License](https://img.shields.io/github/license/ductoman16/DnDBeyond-Live-Campaign?style=plastic) ![Static Badge](https://img.shields.io/badge/JavaScript-x?style=plastic&logo=javascript&color=%235b5b5b)

![Live Update Campaign Page Splash](./images/live-update-campaign.png)

**D&D Beyond Live-Update Campaign Page** is a script that allows you to view live data about each of the characters in a D&D Beyond campaign from the Campaign page itself.

- [D\&D Beyond Live-Update Campaign Page](#dd-beyond-live-update-campaign-page)
  - [1. Prerequisites](#1-prerequisites)
  - [2. How to Install and Set-up](#2-how-to-install-and-set-up)
  - [3. How to Use](#3-how-to-use)
  - [4. What does it look like?](#4-what-does-it-look-like)
  - [5. Testing](#5-testing)
  - [6. Credits](#6-credits)
  - [7. License](#7-license)
  - [8. Version Notes](#8-version-notes)
    - [v 1.1.1](#v-111)
    - [v 1.1](#v-11)

## 1. Prerequisites

To use this script, you will need a browser extension that allows you to run User Scripts. There a numerous available to choose from, including:

| Extension | Browser Support |
| --- | --- |
| [Firemonkey](https://addons.mozilla.org/en-US/firefox/addon/firemonkey/) | ![Firefox](./images/icon-firefox.png) |
| [Greasemonkey](https://www.greasespot.net/) | ![Firefox](./images/icon-firefox.png) |
| [Tampermonkey](https://www.tampermonkey.net/) | ![Chrome](./images/icon-chrome-18.png) ![Edge](./images/icon-edge.png) ![Firefox](./images/icon-firefox.png) ![Opera Next](./images/icon-opera.png) ![Safari](./images/icon-safari.png) |
| [Violentmonkey](https://violentmonkey.github.io/) | ![Chrome](./images/icon-chrome-18.png) ![Edge](./images/icon-edge.png) ![Firefox](./images/icon-firefox.png) |

Install one of these extensions for your browser. If you're not sure, I recommend Tampermonkey.

## 2. How to Install and Set-up

Ensure you are running a browser extension that takes UserScripts (see Prerequisites above).

Click on the Install Script button below to install this user script to your browser extension, then follow the instructions from your browser extension.

[![Live Update Campaign Page Splash](./images/install-button.png)](https://github.com/ductoman16/DnDBeyond-Live-Campaign/raw/master/ddb-live-campaign.user.js)

## 3. How to Use

1. Open your [campaigns page on the D&D Beyond website](https://www.dndbeyond.com/my-campaigns).
2. Click on one of your campaigns.

You'll now see additional information displayed on the card of each character, showing:

- Current Hit Points
- Current Armor Class
- Ability Scores
- Passive Perception / Investigation / Insight

The data is automatically updated every 30 seconds.

## 4. What does it look like?

This is how the character cards on the campaign page look with this script running.

![Live Update Campaign Page Splash](./images/example-campaign.jpg)

## 5. Testing

Run the local regression tests with:

```powershell
node --test tests\stat-normalization.test.js
```

The userscript also has an opt-in self-check for the real campaign page. In the browser console on a D&D Beyond campaign page, run:

```javascript
localStorage.setItem("ddbLiveCampaignValidate", "true");
location.reload();
```

After reload, each character update logs either `DDB Live Campaign validation passed` or a detailed mismatch list. You can also run `window.ddbLiveCampaignValidate()` manually in the console. Disable it with:

```javascript
localStorage.removeItem("ddbLiveCampaignValidate");
```

To verify against a real authenticated D&D Beyond campaign page in Playwright's separate Chromium profile:

```powershell
$env:LIVE_DDB_CAMPAIGN_URL = "https://www.dndbeyond.com/campaigns/YOUR_CAMPAIGN_ID"
$env:LIVE_DDB_CHARACTER_FILTER = "Roric" # optional
node --test tests\live-ddb-campaign.test.js
```

If the Chromium profile is not logged into D&D Beyond yet, the test opens a headed browser. Log in manually, then re-run the command. The profile is saved at `%USERPROFILE%\.ddb-live-campaign-playwright-profile`.

If Google blocks login in bundled Chromium, use installed Microsoft Edge instead:

```powershell
$env:LIVE_DDB_BROWSER_CHANNEL = "msedge"
node --test tests\live-ddb-campaign.test.js
```

## 6. Credits

This project has the following lineage:

1. [TeaWithLucas](https://github.com/TeaWithLucas) created [DNDBeyond-DM-Screen](https://github.com/TeaWithLucas/DNDBeyond-DM-Screen) — the original foundation, including the DDB API integration.
2. [Faith Elisabeth Lilley](https://github.com/FaithLilley) (aka Stormknight) forked it to create this project, **D&D Beyond Live-Update Campaign**, with contributions from [@xander-hirst](https://github.com/xander-hirst).
3. [Ryan Lennox](https://github.com/ductoman16) (ductoman16) forked Stormknight's project and maintains this version.

## 7. License

This project uses the [MIT license](LICENSE.md).

## 8. Version Notes

### v 1.1.2

Add support for displaying Temporary Hit Points.

### v 1.1.1

Fix due to version change of the DDB API libraries. Thanks Xander!

### v 1.1

First full release.
