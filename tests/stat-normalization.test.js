const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "ddb-live-campaign.user.js");
const scriptSource = fs.readFileSync(scriptPath, "utf8");
const helperSource = scriptSource.match(
    /\/\/ TESTABLE_STAT_HELPERS_START([\s\S]*?)\/\/ TESTABLE_STAT_HELPERS_END/
)[1];

const sandbox = {
    module: { exports: {} },
};
vm.runInNewContext(helperSource, sandbox);

const { normalizeAbilityScores, normalizeDerivedStats } = sandbox.module.exports;

function ability(id, name, totalScore) {
    return {
        id,
        name,
        totalScore,
        modifier: Math.floor((totalScore - 10) / 2),
    };
}

function characterWithOptionalWoodElfOrigin() {
    return {
        optionalOrigins: [{ racialTraitId: 1234 }],
        race: { isLegacy: false },
        classes: [{ definition: { sources: [{ sourceId: 1 }] } }],
        stats: [
            { id: 1, value: 15 },
            { id: 2, value: 18 },
            { id: 3, value: 16 },
            { id: 4, value: 15 },
            { id: 5, value: 15 },
            { id: 6, value: 12 },
        ],
        modifiers: {
            race: [
                { type: "bonus", subType: "dexterity-score", value: 2 },
                { type: "bonus", subType: "wisdom-score", value: 1 },
            ],
        },
    };
}

function characterWithLegacyWoodElfAnd2024Class() {
    return {
        optionalOrigins: [],
        race: { isLegacy: true },
        classes: [{ definition: { name: "Ranger", sources: [{ sourceId: 145 }] } }],
        inventory: [
            {
                equipped: true,
                definition: {
                    filterType: "Armor",
                    type: "Light Armor",
                    name: "Leather",
                },
            },
        ],
        stats: [
            { id: 1, value: 15 },
            { id: 2, value: 16 },
            { id: 3, value: 15 },
            { id: 4, value: 15 },
            { id: 5, value: 14 },
            { id: 6, value: 11 },
        ],
        modifiers: {
            race: [
                { type: "bonus", subType: "dexterity-score", value: 2 },
                { type: "bonus", subType: "wisdom-score", value: 1 },
            ],
        },
    };
}

test("keeps regular racial ability bonuses for characters without optional origin replacements", () => {
    const abilities = [
        ability(2, "dex", 16),
        ability(6, "cha", 16),
    ];
    const character = {
        optionalOrigins: [],
        race: { isLegacy: false },
        classes: [{ definition: { sources: [{ sourceId: 1 }] } }],
        stats: [
            { id: 2, value: 15 },
            { id: 6, value: 15 },
        ],
        modifiers: {
            race: [
                { type: "bonus", subType: "dexterity-score", value: 1 },
                { type: "bonus", subType: "charisma-score", value: 1 },
            ],
        },
    };

    const normalized = normalizeAbilityScores(abilities, character);

    assert.equal(normalized.find((item) => item.name === "dex").totalScore, 16);
    assert.equal(normalized.find((item) => item.name === "dex").modifier, 3);
    assert.equal(normalized.find((item) => item.name === "cha").totalScore, 16);
    assert.equal(normalized.find((item) => item.name === "cha").modifier, 3);
});

test("removes legacy species ability bonuses for 2024-rule characters", () => {
    const normalized = normalizeAbilityScores(
        [
            ability(1, "str", 15),
            ability(2, "dex", 20),
            ability(3, "con", 16),
            ability(4, "int", 15),
            ability(5, "wis", 16),
            ability(6, "cha", 12),
        ],
        characterWithLegacyWoodElfAnd2024Class()
    );

    assert.equal(normalized.find((item) => item.name === "dex").totalScore, 18);
    assert.equal(normalized.find((item) => item.name === "dex").modifier, 4);
    assert.equal(normalized.find((item) => item.name === "wis").totalScore, 15);
    assert.equal(normalized.find((item) => item.name === "wis").modifier, 2);
    assert.equal(normalized.find((item) => item.name === "str").totalScore, 15);
});

test("applies corrected 2024-rule ability modifier deltas to initiative and passive scores", () => {
    const normalized = normalizeDerivedStats({
        armorClass: 16,
        initiative: 5,
        passivePerception: 16,
        passiveInvestigation: 12,
        passiveInsight: 13,
        abilities: [
            ability(1, "str", 15),
            ability(2, "dex", 20),
            ability(3, "con", 16),
            ability(4, "int", 15),
            ability(5, "wis", 16),
            ability(6, "cha", 12),
        ],
        rawCharacter: characterWithLegacyWoodElfAnd2024Class(),
    });

    assert.equal(normalized.armorClass, 15);
    assert.equal(normalized.initiative, 4);
    assert.equal(normalized.passivePerception, 15);
    assert.equal(normalized.passiveInvestigation, 12);
    assert.equal(normalized.passiveInsight, 12);
});

test("does not apply corrected dexterity delta to heavy or capped medium armor", () => {
    const mediumArmorCharacter = characterWithLegacyWoodElfAnd2024Class();
    mediumArmorCharacter.inventory = [
        {
            equipped: true,
            definition: {
                filterType: "Armor",
                type: "Medium Armor",
                name: "Half Plate",
            },
        },
    ];

    const heavyArmorCharacter = characterWithLegacyWoodElfAnd2024Class();
    heavyArmorCharacter.inventory = [
        {
            equipped: true,
            definition: {
                filterType: "Armor",
                type: "Heavy Armor",
                name: "Chain Mail",
            },
        },
    ];

    for (const rawCharacter of [mediumArmorCharacter, heavyArmorCharacter]) {
        const normalized = normalizeDerivedStats({
            armorClass: 17,
            initiative: 5,
            passivePerception: 16,
            passiveInvestigation: 12,
            passiveInsight: 13,
            abilities: [
                ability(1, "str", 15),
                ability(2, "dex", 20),
                ability(3, "con", 16),
                ability(4, "int", 15),
                ability(5, "wis", 16),
                ability(6, "cha", 12),
            ],
            rawCharacter,
        });

        assert.equal(normalized.armorClass, 17);
    }
});

test("applies corrected dexterity delta to unarmored and uncapped medium armor", () => {
    const unarmoredCharacter = characterWithLegacyWoodElfAnd2024Class();
    unarmoredCharacter.inventory = [];

    const mediumArmorCharacter = characterWithLegacyWoodElfAnd2024Class();
    mediumArmorCharacter.inventory = [
        {
            equipped: true,
            definition: {
                filterType: "Armor",
                type: "Medium Armor",
                name: "Scale Mail",
            },
        },
    ];

    for (const rawCharacter of [unarmoredCharacter, mediumArmorCharacter]) {
        const normalized = normalizeDerivedStats({
            armorClass: 14,
            initiative: 5,
            passivePerception: 16,
            passiveInvestigation: 12,
            passiveInsight: 13,
            abilities: [
                ability(1, "str", 15),
                ability(2, "dex", 14),
                ability(3, "con", 16),
                ability(4, "int", 15),
                ability(5, "wis", 16),
                ability(6, "cha", 12),
            ],
            rawCharacter,
        });

        assert.equal(normalized.armorClass, 13);
    }
});

test("removes duplicated legacy racial bonuses when optional origins already shifted the sheet stats", () => {
    const normalized = normalizeAbilityScores(
        [
            ability(1, "str", 15),
            ability(2, "dex", 20),
            ability(3, "con", 16),
            ability(4, "int", 15),
            ability(5, "wis", 16),
            ability(6, "cha", 12),
        ],
        characterWithOptionalWoodElfOrigin()
    );

    assert.equal(normalized.find((item) => item.name === "dex").totalScore, 18);
    assert.equal(normalized.find((item) => item.name === "dex").modifier, 4);
    assert.equal(normalized.find((item) => item.name === "wis").totalScore, 15);
    assert.equal(normalized.find((item) => item.name === "wis").modifier, 2);
    assert.equal(normalized.find((item) => item.name === "con").totalScore, 16);
});

test("applies corrected ability modifier deltas to initiative and passive scores", () => {
    const normalized = normalizeDerivedStats({
        initiative: 5,
        passivePerception: 16,
        passiveInvestigation: 12,
        passiveInsight: 13,
        abilities: [
            ability(1, "str", 15),
            ability(2, "dex", 20),
            ability(3, "con", 16),
            ability(4, "int", 15),
            ability(5, "wis", 16),
            ability(6, "cha", 12),
        ],
        rawCharacter: characterWithOptionalWoodElfOrigin(),
    });

    assert.equal(normalized.initiative, 4);
    assert.equal(normalized.passivePerception, 15);
    assert.equal(normalized.passiveInvestigation, 12);
    assert.equal(normalized.passiveInsight, 12);
});
