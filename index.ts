import { readFileSync } from 'fs';
import levenshtein from 'fast-levenshtein';

// It can be fun to make silly intentional misspellings of the card names
//
// e.g.,
//  Crab => "carb"
//
// Allow some fuzziness when reading cards from input - take the closest match in card_types
const getCardByLevenshteinDistance = (card_name, card_names) => card_names.reduce((accumulator, currentValue) => {
    const d = levenshtein.get(card_name, currentValue);
    if (d < accumulator.distance) {
        return { card_name: currentValue, distance: d };
    } else {
        return accumulator;
    }
}, { card_name: null, distance: Infinity });

const card_types = {
    mermaid: {
        color: 'white',
        /**
         * 1 point for each card of the color the player has the most of.
         * If they have more mermaid cards, they must look at which of the other colors they have more of.
         * The same color cannot be counted for more than one mermaid card.
         */
        eval: (cards) => {
            let points = 0;
            const effects = [];

            const { hand, played } = cards['mermaid']
            const total = (hand + played)

            if (total === 4) {
                effects.push('If they place 4 mermaid cards, the player immediately wins the game');
            }

            const visited_colors = new Set();
            for (let i = 0; i < total; i ++) {
                for (const c of Object.keys(cards)) {
                    if (c === 'merm' || visited_colors.has(card_types[c].color)) {
                        continue;
                    }

                    points += (cards[c].hand + cards[c].played);
                    visited_colors.add(card_types[c].color);
                }
            }

            return { points, effects };
        },
    },

    crab: {
        color: 'light blue',
        eval: (cards) => {
            let points = 0;
            const effects = [];

            const { hand, played } = cards['crab']
            if ((hand + played) === 2) {
                points = 1;
                effects.push('[If played] The player chooses a discard pile, consults it without shuffling it, and chooses a card from it to add to their hand. They do not have to show it to the other players')
            }

            return { points, effects };
        }
    },

    boat: {
        color: 'dark blue',
        eval: (cards) => {
            let points = 0;
            const effects = [];

            const { hand, played } = cards['boat']
            if ((hand + played) === 2) {
                points = 1;
                effects.push('[If played] The player immediately takes another turn')
            }

            return { points, effects };
        },
    },

    fish: {
        color: 'dark blue',
        eval: (cards) => {
            let points = 0;
            const effects = [];

            const { hand, played } = cards['fish']
            if ((hand + played) === 2) {
                points = 1;
                effects.push('[If played] The player adds the top card from the deck to their hand.')
            }

            return { points, effects };
        }
    },

    // complement of shark
    swimmer: {
        color: 'light blue',
        eval: (cards) => {
            let points = 0;
            const effects = [];

            // TODO: cache this calculation so that either can use it (you cannot skip one because ordering is not guaranteed)
            const [sharkH, sharkP, swimmerH, swimmerP] = [
                cards['shark'].hand,
                cards['shark'].played,
                cards['swimmer'].hand,
                cards['swimmer'].played,
            ]


            if (sharkH === 1 && swimmerH === 1) {
                effects.push('[If played] The player steals a random card from another player and adds it to their hand.')
            }

            // sum of cards across hand and played
            if (
                [sharkH, sharkP, swimmerH, swimmerP].reduce((accumulator, currentValue) => accumulator + currentValue, 0)
            ) {
                points = 0.5
            }

            return { points, effects };
        }
    },

    // complement of swimmer
    shark: {
        color: 'light blue',
        eval: (cards) => {
            let points = 0;
            const effects = [];

            // TODO: cache this calculation so that either can use it (you cannot skip one because ordering is not guaranteed)
            const [sharkH, sharkP, swimmerH, swimmerP] = [
                cards['shark'].hand,
                cards['shark'].played,
                cards['swimmer'].hand,
                cards['swimmer'].played,
            ]


            if (sharkH === 1 && swimmerH === 1) {
                effects.push('[If played] The player steals a random card from another player and adds it to their hand.')
            }

            // sum of cards across hand and played
            if (
                [sharkH, sharkP, swimmerH, swimmerP]
                    .reduce((accumulator, currentValue) => accumulator + currentValue, 0)
            ) {
                points = 0.5
            }

            return { points, effects };
        }
    },

    shell: {
        color: 'black',
        scaling: [0, 2, 4, 6, 8, 10]
    },

    octopus: {
        color: 'light_green',
        scaling: [0, 3, 6, 9, 12]
    },

    penguin: {
        color: 'orange',
        scaling: [1, 3, 5]
    },

    sailor: {
        color: 'blue',
        scaling: [0, 5]
    },
}

const count_csv = (filename) => readFileSync(filename)
    .toString()
    .trimEnd()
    .split('\n')
    .reduce((accumulator, currentValue) => {
        const { card_name } = getCardByLevenshteinDistance(currentValue, Object.keys(card_types))
        if (!accumulator[card_name]) {
            accumulator[card_name] = 0;
        }
        accumulator[card_name] += 1;

        return accumulator;
    }, {})

const turn = () => {
    const hand = count_csv('./hand.csv')
    const played = count_csv('./played.csv')

    const cards = (() => {
        const c = {}
        for (const [hk, hv] of Object.entries(hand)) {
            if (c[hk]) {
                c[hk].hand += hv
            } else {
                c[hk] = { hand: hv, played: 0 }
            }
        }

        for (const [pk, pv] of Object.entries(played)) {
            if (c[pk]) {
                c[pk].played += pv;
            } else {
                c[pk] = { hand: 0, played: pv };
            }
        }

        const getInnerTotal = ({ hand, played }) => hand + played

        return Object.keys(c)
            .sort((a, b) => getInnerTotal(c[b]) - getInnerTotal(c[a]))
            .reduce((accumulator, currentValue) => {
                accumulator[currentValue] = c[currentValue];
                return accumulator;
            }, {});
    })();

    const state_changes = Object.keys(cards)
        .map((card) => {
            const ct = card_types[card]
            const { points, effects } = ct.eval ? ct.eval(cards) : { points: 0, effects: [] }
            return { card, points, effects }
        })

    console.log(state_changes);

    const { effects, points } = state_changes.reduce((acc, currVal) => {
        for (const effect of (currVal.effects || [])) {
            acc.effects.add(effect)
        }
        acc.points += currVal.points
        return acc
    }, { effects: new Set(), points: 0 })

    if (points >= 7) {
        effects.add('If the player has reached 7 points or more by counting the points on their cards, both in their hand and in front of them (see Card Details), they can decide to end the round');
    }

    return { effects, points };
}

const t = turn();
console.log(t);
