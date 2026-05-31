const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function requirePlaywright() {
    try {
        return require("playwright");
    } catch (error) {
        const bundledPath = path.join(
            os.homedir(),
            ".cache",
            "codex-runtimes",
            "codex-primary-runtime",
            "dependencies",
            "node",
            "node_modules",
            "playwright"
        );
        return require(bundledPath);
    }
}

const CAMPAIGN_URL = process.env.LIVE_DDB_CAMPAIGN_URL;
const CHARACTER_FILTER = process.env.LIVE_DDB_CHARACTER_FILTER
    ? new RegExp(process.env.LIVE_DDB_CHARACTER_FILTER, "i")
    : null;
const PROFILE_DIR =
    process.env.LIVE_DDB_PROFILE_DIR || path.join(os.homedir(), ".ddb-live-campaign-playwright-profile");
const HEADLESS = process.env.LIVE_DDB_HEADLESS === "1";
const BROWSER_CHANNEL = process.env.LIVE_DDB_BROWSER_CHANNEL || undefined;
const LOGIN_WAIT_MS = Number(process.env.LIVE_DDB_LOGIN_WAIT_MS || 120000);
const SCRIPT_PATH = path.join(__dirname, "..", "ddb-live-campaign.user.js");
const COOKIE_FILE = process.env.LIVE_DDB_COOKIE_FILE;

const abilityNames = {
    str: "STRENGTH",
    dex: "DEXTERITY",
    con: "CONSTITUTION",
    int: "INTELLIGENCE",
    wis: "WISDOM",
    cha: "CHARISMA",
};

const abilityModifierSubTypes = {
    str: "strength-score",
    dex: "dexterity-score",
    con: "constitution-score",
    int: "intelligence-score",
    wis: "wisdom-score",
    cha: "charisma-score",
};

function signedModifier(score) {
    const modifier = Math.floor((score - 10) / 2);
    return `${modifier >= 0 ? "+" : ""}${modifier}`;
}

function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function assertDdbPayloadContract(card) {
    const character = card.payloadContract;
    assert.ok(character, `${card.name} payload contract: character payload was captured`);
    assert.ok(Array.isArray(character.stats), `${card.name} payload contract: stats is an array`);
    assert.ok(Array.isArray(character.classes), `${card.name} payload contract: classes is an array`);
    assert.ok(Array.isArray(character.inventory), `${card.name} payload contract: inventory is an array`);
    assert.ok(character.race && typeof character.race.isLegacy === "boolean", `${card.name} payload contract: race.isLegacy is boolean`);
    assert.ok(character.modifiers && typeof character.modifiers === "object", `${card.name} payload contract: modifiers object exists`);

    for (const abilityId of [1, 2, 3, 4, 5, 6]) {
        const stat = character.stats.find((item) => item.id === abilityId);
        assert.ok(stat, `${card.name} payload contract: stats contains ability id ${abilityId}`);
        assert.ok(
            stat.value === null || typeof stat.value === "number",
            `${card.name} payload contract: ability id ${abilityId} value is number/null`
        );
    }

    for (const classInfo of character.classes) {
        assert.ok(classInfo.definition, `${card.name} payload contract: class definition exists`);
        assert.ok(
            Array.isArray(classInfo.definition.sources),
            `${card.name} payload contract: class definition sources is an array`
        );
        for (const source of classInfo.definition.sources) {
            assert.equal(typeof source.sourceId, "number", `${card.name} payload contract: sourceId is numeric`);
        }
    }

    const armor = character.inventory.find((item) => item.equipped && item.definition?.filterType === "Armor");
    if (armor) {
        assert.equal(typeof armor.definition.type, "string", `${card.name} payload contract: equipped armor has type`);
        assert.ok(
            ["Light Armor", "Medium Armor", "Heavy Armor", "Shield"].includes(armor.definition.type) ||
                armor.definition.type.includes("Armor"),
            `${card.name} payload contract: equipped armor type is recognizable (${armor.definition.type})`
        );
    }

    const allModifiers = Object.values(character.modifiers).flatMap((group) => (Array.isArray(group) ? group : []));
    for (const subType of Object.values(abilityModifierSubTypes)) {
        for (const modifier of allModifiers.filter((item) => item.subType === subType)) {
            assert.equal(modifier.type, "bonus", `${card.name} payload contract: ${subType} modifier remains a bonus`);
            assert.ok(
                modifier.value === null || typeof modifier.value === "number",
                `${card.name} payload contract: ${subType} modifier value is number/null`
            );
        }
    }
}

test("live D&D Beyond campaign card stats match character sheets", { skip: !CAMPAIGN_URL }, async (t) => {
    const { chromium } = requirePlaywright();
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: HEADLESS,
        bypassCSP: true,
        channel: BROWSER_CHANNEL,
        viewport: { width: 1500, height: 1000 },
    });
    t.after(async () => {
        await context.close();
    });

    const page = await context.newPage();
    if (COOKIE_FILE) {
        const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, "utf8"));
        await context.addCookies(cookies);
    }
    await page.goto(CAMPAIGN_URL, { waitUntil: "domcontentloaded" });

    try {
        await page.waitForSelector(
            ".ddb-campaigns-detail-body-listing-active .ddb-campaigns-character-card-footer-links-item-view",
            { timeout: LOGIN_WAIT_MS }
        );
    } catch (error) {
        throw new Error(
            `Chromium profile is not logged into D&D Beyond. Re-run headed, log in manually, then run again. Profile: ${PROFILE_DIR}`
        );
    }

    await page.addScriptTag({ url: "https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js" });
    await page.addScriptTag({
        url: "https://media.dndbeyond.com/character-tools/vendors~characterTools.bundle.dec3c041829e401e5940.min.js",
    });
    await page.addScriptTag({ path: SCRIPT_PATH });

    await page.waitForSelector(".ddb-lc-character-expanded", { timeout: 60000 });
    await page.waitForFunction(
        (filterSource) => {
            const filter = filterSource ? new RegExp(filterSource, "i") : null;
            const cards = [...document.querySelectorAll(".ddb-campaigns-detail-body-listing-active li")]
                .filter((card) => {
                    const link = card.querySelector(".ddb-campaigns-character-card-footer-links-item-view");
                    return !filter || filter.test(card.innerText) || filter.test(link?.href || "");
                });
            return (
                cards.length > 0 &&
                cards.every((card) => {
                    const ac = card.querySelector(".ddb-lc-armorclass")?.textContent.trim();
                    const values = [...card.querySelectorAll(".ddb-lc-character-attributes-value")].map((node) =>
                        node.textContent.trim()
                    );
                    return ac && ac !== "AC" && values.length === 6 && values.some((value) => value !== "10");
                })
            );
        },
        process.env.LIVE_DDB_CHARACTER_FILTER || null,
        { timeout: 60000 }
    );

    const campaignStats = await page.evaluate(() => {
        function text(root, selector) {
            const node = root.querySelector(selector);
            return node ? node.textContent.trim() : "";
        }
        return [...document.querySelectorAll(".ddb-campaigns-detail-body-listing-active li")]
            .map((card) => {
                const link = card.querySelector(".ddb-campaigns-character-card-footer-links-item-view");
                if (!link) {
                    return null;
                }
                const name =
                    text(card, ".ddb-campaigns-character-card-header-upper-character-info-primary") ||
                    text(card, ".ddb-campaigns-character-card-header-upper-character-info-name");
                return {
                    name,
                    url: link.href,
                    armorClass: text(card, ".ddb-lc-armorclass"),
                    initiative:
                        text(card, ".ddb-lc-character-stats-initiative-sign") +
                        text(card, ".ddb-lc-character-stats-initiative-value"),
                    passives: {
                        perception: text(card, ".ddb-lc-passive-perception"),
                        investigation: text(card, ".ddb-lc-passive-investigation"),
                        insight: text(card, ".ddb-lc-passive-insight"),
                    },
                    payloadContract: (() => {
                        const idMatch = link.href.match(/\/characters\/(\d+)/);
                        const characterId = idMatch ? idMatch[1] : null;
                        const characterData = characterId && window.charactersData && window.charactersData[characterId];
                        const character = characterData && characterData.state && characterData.state.character;
                        if (!character) {
                            return null;
                        }
                        return {
                            stats: character.stats,
                            classes: character.classes,
                            inventory: character.inventory,
                            race: character.race,
                            modifiers: character.modifiers,
                        };
                    })(),
                    stats: {
                        str: {
                            score: text(card, ".ddb-lc-value-str"),
                            modifier: text(card, ".ddb-lc-modifier-str"),
                        },
                        dex: {
                            score: text(card, ".ddb-lc-value-dex"),
                            modifier: text(card, ".ddb-lc-modifier-dex"),
                        },
                        con: {
                            score: text(card, ".ddb-lc-value-con"),
                            modifier: text(card, ".ddb-lc-modifier-con"),
                        },
                        int: {
                            score: text(card, ".ddb-lc-value-int"),
                            modifier: text(card, ".ddb-lc-modifier-int"),
                        },
                        wis: {
                            score: text(card, ".ddb-lc-value-wis"),
                            modifier: text(card, ".ddb-lc-modifier-wis"),
                        },
                        cha: {
                            score: text(card, ".ddb-lc-value-cha"),
                            modifier: text(card, ".ddb-lc-modifier-cha"),
                        },
                    },
                };
            })
            .filter(Boolean);

        function normalizeInt(value) {
            const parsed = Number.parseInt(value, 10);
            return Number.isFinite(parsed) ? parsed : null;
        }
    });

    const selectedCards = CHARACTER_FILTER
        ? campaignStats.filter((card) => CHARACTER_FILTER.test(card.name) || CHARACTER_FILTER.test(card.url))
        : campaignStats;

    assert.ok(campaignStats.length > 0, "Expected at least one campaign character card");
    assert.ok(selectedCards.length > 0, "No campaign cards matched LIVE_DDB_CHARACTER_FILTER");

    for (const card of selectedCards) {
        assertDdbPayloadContract(card);

        const sheetPage = await context.newPage();
        await sheetPage.goto(card.url, { waitUntil: "domcontentloaded" });
        await sheetPage.waitForFunction(
            () => /STRENGTH|DEXTERITY|CONSTITUTION|INTELLIGENCE|WISDOM|CHARISMA/i.test(document.body.innerText),
            null,
            { timeout: 60000 }
        );

        const sheetStats = await sheetPage.evaluate((abilityNamesFromNode) => {
            const labels = Object.entries(abilityNamesFromNode);
            const bodyText = document.body.innerText;
            const lines = bodyText
                .split(/\n+/)
                .map((line) => line.trim())
                .filter(Boolean);
            const lineStats = {};
            for (const [key, label] of labels) {
                const labelIndex = lines.findIndex((line) => line.toUpperCase() === label);
                if (labelIndex < 0) {
                    continue;
                }
                const windowLines = lines.slice(labelIndex + 1, labelIndex + 8);
                const signIndex = windowLines.findIndex((line) => line === "+" || line === "-");
                const score = windowLines.find((line, index) => {
                    const parsed = Number.parseInt(line, 10);
                    return index > signIndex + 1 && Number.isFinite(parsed) && parsed >= 1 && parsed <= 30;
                });
                if (signIndex >= 0 && windowLines[signIndex + 1] && score) {
                    lineStats[key] = {
                        score,
                        modifier: windowLines[signIndex] + windowLines[signIndex + 1],
                    };
                }
            }
            if (Object.keys(lineStats).length === labels.length) {
                return lineStats;
            }

            const byModernSheet = {};

            for (const [key, label] of labels) {
                const labelNode = [...document.querySelectorAll("*")].find(
                    (node) => node.children.length === 0 && node.textContent.trim().toUpperCase() === label
                );
                const root =
                    labelNode &&
                    labelNode.closest(
                        ".ct-ability-summary, .ct-ability-pane, .ddbc-ability-summary, .ct-quick-info__ability"
                    );
                if (!root) {
                    continue;
                }
                const rootText = root.innerText;
                const numbers = rootText.match(/[+-]?\d+/g) || [];
                const score = numbers.find((value) => {
                    const parsed = Number.parseInt(value, 10);
                    return parsed >= 1 && parsed <= 30;
                });
                const modifier = numbers.find((value) => /^[+-]/.test(value));
                if (score && modifier) {
                    byModernSheet[key] = { score, modifier };
                }
            }

            if (Object.keys(byModernSheet).length === labels.length) {
                return byModernSheet;
            }

            const fallback = {};
            for (const [key, label] of labels) {
                const re = new RegExp(`${label}[\\s\\S]{0,120}?([+-]\\d+)[\\s\\S]{0,80}?(\\d{1,2})`, "i");
                const match = bodyText.match(re);
                if (match) {
                    fallback[key] = { score: match[2], modifier: match[1] };
                }
            }
            return fallback;
        }, abilityNames);
        const sheetArmorClass = await sheetPage.evaluate(() => {
            const lines = document.body.innerText
                .split(/\n+/)
                .map((line) => line.trim())
                .filter(Boolean);
            const armorClassIndex = lines.findIndex((line) => line.toUpperCase() === "ARMOR CLASS");
            if (armorClassIndex < 0) {
                return null;
            }
            const windowLines = lines.slice(armorClassIndex + 1, armorClassIndex + 8);
            const value = windowLines.find((line) => /^\d+$/.test(line));
            return value || null;
        });
        const sheetDerivedStats = await sheetPage.evaluate(() => {
            const lines = document.body.innerText
                .split(/\n+/)
                .map((line) => line.trim())
                .filter(Boolean);

            function readSignedValue(label) {
                const index = lines.findIndex((line) => line.toUpperCase() === label.toUpperCase());
                if (index < 0) {
                    return null;
                }
                const windowLines = lines.slice(index + 1, index + 8);
                const signIndex = windowLines.findIndex((line) => line === "+" || line === "-");
                if (signIndex < 0 || !windowLines[signIndex + 1]) {
                    return null;
                }
                return windowLines[signIndex] + windowLines[signIndex + 1];
            }

            function readNumberBeforeLabel(label) {
                const index = lines.findIndex((line) => line.toUpperCase() === label.toUpperCase());
                if (index <= 0) {
                    return null;
                }
                return /^\d+$/.test(lines[index - 1]) ? lines[index - 1] : null;
            }

            return {
                initiative: readSignedValue("INITIATIVE"),
                passives: {
                    perception: readNumberBeforeLabel("PASSIVE PERCEPTION"),
                    investigation: readNumberBeforeLabel("PASSIVE INVESTIGATION"),
                    insight: readNumberBeforeLabel("PASSIVE INSIGHT"),
                },
            };
        });

        assert.equal(
            normalizeText(card.armorClass),
            normalizeText(sheetArmorClass),
            `${card.name} Armor Class`
        );
        assert.equal(
            normalizeText(card.initiative),
            normalizeText(sheetDerivedStats.initiative),
            `${card.name} Initiative`
        );
        for (const passive of ["perception", "investigation", "insight"]) {
            assert.equal(
                normalizeText(card.passives[passive]),
                normalizeText(sheetDerivedStats.passives[passive]),
                `${card.name} Passive ${passive}`
            );
        }

        for (const key of Object.keys(abilityNames)) {
            assert.ok(sheetStats[key], `Could not read ${abilityNames[key]} from ${card.name}'s sheet`);
            assert.equal(
                normalizeText(card.stats[key].score),
                normalizeText(sheetStats[key].score),
                `${card.name} ${abilityNames[key]} score`
            );
            assert.equal(
                normalizeText(card.stats[key].modifier),
                normalizeText(sheetStats[key].modifier || signedModifier(Number(sheetStats[key].score))),
                `${card.name} ${abilityNames[key]} modifier`
            );
        }

        await sheetPage.close();
    }
});
