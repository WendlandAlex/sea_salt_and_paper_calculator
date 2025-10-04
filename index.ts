import { readFileSync } from 'fs';
import levenshtein from 'fast-levenshtein';

// It can be fun to make silly intentional misspellings of the card names
//
// e.g.,
//  Crab => "carb"
//
// Allow some fuzziness when reading cards from input - take the closest match in card_types
const getByLevenshteinDistance = (candidate, possible_values) => possible_values.reduce((accumulator, currentValue) => {
    const d = levenshtein.get(candidate, currentValue);
    if (d < accumulator.distance) {
        return { value: currentValue, distance: d };
    } else {
        return accumulator;
    }
}, { value: null, distance: Infinity });

// cards add points to score whether they are played or in the hand
const getInnerTotal = ({ hand, played }) => hand + played

const colors = [
    'white',
    'black',
    'red',
    'light red',
    'dark red',
    'yellow',
    'light yellow',
    'dark yellow',
    'blue',
    'light blue',
    'dark blue',
    'orange',
    'light orange',
    'dark orange',
    'green',
    'light green',
    'dark green',
    'brown',
    'light brown',
    'dark brown',
    'violet',
    'light violet',
    'dark violet',
    'gray',
    'dark gray',
    'silver',
    'gold',
]

const card_types = {
    // Duo cards
    crab: {
        eval: (cards) => {
            let points = 0;
            const effects = [];

            const total = cards.filter(({ card_name }) => card_name === 'crab').length;
            if (total === 2) {
                points = 1;
                effects.push('[If they play 2 crab cards] The player chooses a discard pile, consults it without shuffling it, and chooses a card from it to add to their hand. They do not have to show it to the other players')
            }

            return { points, effects };
        }
    },

    boat: {
        eval: (cards) => {
            let points = 0;
            const effects = [];

            const total = cards.filter(({ card_name }) => card_name === 'boat').length;
            if (total === 2) {
                points = 1;
                effects.push('[If they play 2 boat cards] The player immediately takes another turn')
            }

            return { points, effects };
        },
    },

    fish: {
        eval: (cards) => {
            let points = 0;
            const effects = [];

            const total = cards.filter(({ card_name }) => card_name === 'fish').length;
            if (total === 2) {
                points = 1;
                effects.push('[If they play 2 fish cards] The player adds the top card from the deck to their hand.')
            }

            return { points, effects };
        }
    },

    // complement of shark
    swimmer: {
        eval: (cards) => {
            let points = 0;
            const effects = [];

            // TODO: cache this calculation so that either can use it (you cannot skip one because ordering is not guaranteed)
            const [sharkH, sharkP, swimmerH, swimmerP] = [
                cards.filter(({ card_name, state }) => card_name === 'shark' && state === 'hand').length,
                cards.filter(({ card_name, state }) => card_name === 'shark' && state === 'played').length,
                cards.filter(({ card_name, state }) => card_name === 'swimmer' && state === 'hand').length,
                cards.filter(({ card_name, state }) => card_name === 'swimmer' && state === 'played').length,
            ]


            if (sharkH === 1 && swimmerH === 1) {
                effects.push('[If they play a pair of shark, swimmer cards] The player steals a random card from another player and adds it to their hand.')
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
        eval: (cards) => {
            let points = 0;
            const effects = [];

            // TODO: cache this calculation so that either can use it (you cannot skip one because ordering is not guaranteed)
            const [sharkH, sharkP, swimmerH, swimmerP] = [
                cards.filter(({ card_name, state }) => card_name === 'shark' && state === 'hand').length,
                cards.filter(({ card_name, state }) => card_name === 'shark' && state === 'played').length,
                cards.filter(({ card_name, state }) => card_name === 'swimmer' && state === 'hand').length,
                cards.filter(({ card_name, state }) => card_name === 'swimmer' && state === 'played').length,
            ]


            if (sharkH === 1 && swimmerH === 1) {
                effects.push('[If they play a pair of shark, swimmer cards] The player steals a random card from another player and adds it to their hand.')
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

    // Mermaid Cards
    mermaid: {
        /**
         * 1 point for each card of the color the player has the most of.
         * If they have more mermaid cards, they must look at which of the other colors they have more of.
         * The same color cannot be counted for more than one mermaid card.
         */
        eval: (cards) => {
            let points = 0;
            const effects = [];

            const total = cards.filter(({ card_name }) => card_name === 'mermaid').length;

            if (total === 4) {
                effects.push('If they place 4 mermaid cards, the player immediately wins the game');
            }

            // sort an array of card totals by color (excluding mermaids)
            // for each mermaid, apply 1 point for each card of the color that has the highest count
            // once a mermaid has been used on a color, exclude that color
            const visited_colors = new Set();
            const cards_by_color = cards
                .filter(({ card_name }) => card_name !== 'mermaid')
                .reduce((accumulator, currentValue) => {
                    const { color } = currentValue;
                    if (!accumulator[color]) {
                        accumulator[color] = 0;
                    }
                    accumulator[color] += 1;

                    return accumulator
                }, {})


            for (let i = 0; i < total; i ++) {
                for (const [color, count] of Object.entries(cards_by_color)) {
                    if (visited_colors.has(color)) {
                        continue;
                    }

                    points += count as number;
                    visited_colors.add(color);
                }
            }

            return { points, effects };
        },
    },

    // Collector Cards
    shell: {
        eval: (cards) => {
             const scaling = [0, 2, 4, 6, 8, 10]
             const total = cards.filter(({ card_name }) => card_name === 'shell').length;
             const points = scaling.at(total - 1)

            return { points, effects: [] }
        }
    },

    octopus: {
        eval: (cards) => {
            const scaling = [0, 3, 6, 9, 12]
            const total = cards.filter(({ card_name }) => card_name === 'octopus').length;
            const points = scaling.at(total - 1)

            return { points, effects: [] }
        }
    },

    penguin: {
        eval: (cards) => {
            const scaling =  [1, 3, 5]
            const total = cards.filter(({ card_name }) => card_name === 'penguin').length;
            const points = scaling.at(total - 1)

            return { points, effects: [] }
        }
    },

    sailor: {
        eval: (cards) => {
            const scaling = [0, 5]
            const total = cards.filter(({ card_name }) => card_name === 'sailor').length;
            const points = scaling.at(total - 1)

            return { points, effects: [] }
        }
    },

    // Point Multiplier Cards
    // 1 point per boat
    lighthouse: {
        eval: (cards) => {
            const total = cards.filter(({ card_name }) => card_name === 'boat').length;
            const points = (total * 1);

            return { points, effects: [] }
        }
    },

    // 1 point per fish
    'shoal of fish': {
        eval: (cards) => {
            const total = cards.filter(({ card_name }) => card_name === 'fish').length;
            const points = (total * 1);

            return { points, effects: [] }
        }
    },

    // 2 points per penguin
    'penguin colony': {
        eval: (cards) => {
            const total = cards.filter(({ card_name }) => card_name === 'penguin').length;
            const points = (total * 2);

            return { points, effects: [] }
        }
    },

    // 3 points per sailor
    'captain': {
        eval: (cards) => {
            const total = cards.filter(({ card_name }) => card_name === 'sailor').length;
            const points = (total * 3);

            return { points, effects: [] }
        }
    },
}

const parse_csv = (filename) => readFileSync(filename)
    .toString()
    .trimEnd()
    .split('\n')
    .reduce((accumulator, currentValue) => {
        const [_card_name, _color] = currentValue
            .split(',')
            .map((i) => i.trim().toLowerCase());

        const { value: card_name } = getByLevenshteinDistance(_card_name, Object.keys(card_types));
        const { value: color } = getByLevenshteinDistance(_color, colors);

        accumulator.push({ card_name, color });
        return accumulator;
    }, [])

const turn = () => {
    const hand = parse_csv('./hand.csv').map((i) => ({ ...i, state: 'hand' }))
    const played = parse_csv('./played.csv').map((i) => ({...i, state: 'played' }))

    const cards = [...hand, ...played];

    // make a calculation once per card type, at the first appearance of that card
    // if you have already calculated a card type and you see another instance of that type, continue
    const { state_changes } = cards.reduce((accumulator, currentValue) => {
            if (accumulator.visited.has(currentValue.card_name)) {
                return accumulator;
            }
            const card_type = card_types[currentValue.card_name]

            console.log(accumulator, currentValue)

            const { points, effects } = card_type.eval(cards)
            accumulator.state_changes.push({ card_name: currentValue.card_name, points, effects })
            accumulator.visited.add(currentValue.card_name)
            return accumulator;
        }, { visited: new Set(), state_changes: [] })

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

    return {
        effects,

        // if a player has only a shark, or only a swimmer, lower their 0.5 points from that card to 0
        points: Math.floor(points)
    };
}

const t = turn();
console.log(t);
