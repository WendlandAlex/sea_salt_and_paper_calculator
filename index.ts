import { readFileSync } from 'fs';
import levenshtein from 'fast-levenshtein';
import { card_names, colors } from './data.ts';

type CardName = typeof card_names[number];

type Color = typeof colors[number];

type Card = {
    name: CardName;
    color: Color;
    state: 'hand' | 'played';
}

type Eval = (cards: Card[]) => { points: number, effects: string[] };

type CardTypes = Record<CardName, { eval: Eval }>


// It can be fun to make silly intentional misspellings of the card names
//
// e.g.,
//  Crab => "carb"
//
// Allow some fuzziness when reading cards from input - take the closest match in card_types
function getByLevenshteinDistance<T extends string> (candidate: string, possible_values: readonly T[]){
    if (!possible_values?.length) {
        throw new Error('possible_values may not be empty');
    }

    // initialize the result with the first possible value, then proceed to search the other values for a better match
    const [first, ...rest] = possible_values;
    const result = {
        value: first,
        distance: levenshtein.get(candidate, first)
    }

    for (const r of rest) {
        const d = levenshtein.get(candidate, r);
        if (d < result.distance) {
            result.value = r
            result.distance = d
        }
    }

    return result;
}


// cache this calculation which is used by both sharks and swimmers
let sharksAndSwimmers: null | number[] = null;

const getSharksAndSwimmers = (cards: Card[]) => {
    if (sharksAndSwimmers === null) {
        const [shark_hand, shark_played, swimmer_hand, swimmer_played] = ['shark', 'swimmer'].flatMap(
            (i) => {
                const { hand, played } = cards
                    .filter(({ name }) => name === i)
                    .reduce((accumulator, { state }) => {
                            accumulator[state] += 1
                            return accumulator;
                        }, { hand: 0, played: 0 }
                    )

                return [
                    hand,
                    played,
                ]
            }
        )

        sharksAndSwimmers = [shark_hand, shark_played, swimmer_hand, swimmer_played]
    }

    return sharksAndSwimmers;
}


const getColorFrequency = (cards: Card[]) => cards
    .reduce((accumulator, { color }) => {
        if (!accumulator[color]) {
            accumulator[color] = 0;
        }
        accumulator[color] += 1;

        return accumulator
    }, {} as Record<Color, number>)


const parse_csv: (filename: string, state: 'hand' | 'played') => Card[] = (filename, state) => readFileSync(filename)
    .toString()
    .trimEnd()
    .split('\n')
    .reduce((accumulator, currentValue) => {
        if (currentValue === '' || currentValue === undefined) {
            return accumulator;
        }
        const [_name, _color] = currentValue
            .split(',')
            .map((i) => i.trim().toLowerCase());

        const { value: name } = getByLevenshteinDistance(_name, card_names);
        const { value: color } = getByLevenshteinDistance(_color, colors);

        accumulator.push({ name, color, state });
        return accumulator;
    }, [] as Card[])

const card_types: CardTypes = {
    // Duo cards
    crab: {
        eval: (cards) => {
            let points = 0;
            const effects = [];

            const { hand, played } = cards.filter(({ name }) => name === 'crab').reduce((acc, { state }) => {
                acc[state] += 1
                return acc;
            }, { hand: 0, played: 0 })

            if (Math.floor(hand / 2)) {
                effects.push('[If they play 2 crab cards] The player chooses a discard pile, consults it without shuffling it, and chooses a card from it to add to their hand. They do not have to show it to the other players')
            }

            points += Math.floor((hand + played) / 2)

            return { points, effects };
        }
    },

    boat: {
        eval: (cards) => {
            let points = 0;
            const effects = [];

            const { hand, played } = cards.filter(({ name }) => name === 'boat').reduce((acc, { state }) => {
                acc[state] += 1
                return acc;
            }, { hand: 0, played: 0 })

            if (Math.floor(hand / 2)) {
                effects.push('[If they play 2 boat cards] The player immediately takes another turn')
            }

            points += Math.floor((hand + played) / 2)

            return { points, effects };
        },
    },

    fish: {
        eval: (cards) => {
            let points = 0;
            const effects = [];

            const { hand, played } = cards.filter(({ name }) => name === 'fish').reduce((acc, { state }) => {
                acc[state] += 1
                return acc;
            }, { hand: 0, played: 0 })

            if (Math.floor(hand / 2)) {
                effects.push('[If they play 2 fish cards] The player adds the top card from the deck to their hand.')
            }

            points += Math.floor((hand + played) / 2)

            return { points, effects };
        }
    },

    // complement of shark
    swimmer: {
        eval: (cards) => {
            let points = 0;
            const effects = [];

            const [shark_hand, shark_played, swimmer_hand, swimmer_played] = getSharksAndSwimmers(cards);


            if (shark_hand >= 1 && swimmer_hand >= 1) {
                effects.push('[If they play a pair of shark, swimmer cards] The player steals a random card from another player and adds it to their hand.')
            }

            // the greatest number of pairs you can form is limited by the less frequent of the 2 card types
            const num_pairs = Math.min((shark_hand + shark_played), (swimmer_hand + swimmer_played))

            // add half of the pairs from this card type, expecting that half of the pairs will be added from the other card type
            points += num_pairs / 2;

            return { points, effects };
        }
    },

    // complement of swimmer
    shark: {
        eval: (cards) => {
            let points = 0;
            const effects = [];

            const [shark_hand, shark_played, swimmer_hand, swimmer_played] = getSharksAndSwimmers(cards);


            if (shark_hand >= 1 && swimmer_hand >= 1) {
                effects.push('[If they play a pair of shark, swimmer cards] The player steals a random card from another player and adds it to their hand.')
            }

            // the greatest number of pairs you can form is limited by the less frequent of the 2 card types
            const num_pairs = Math.min((shark_hand + shark_played), (swimmer_hand + swimmer_played))

            // add half of the pairs from this card type, expecting that half of the pairs will be added from the other card type
            points += num_pairs / 2;

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

            const total = cards.filter(({ name }) => name === 'mermaid').length;

            if (total === 4) {
                effects.push('If they place 4 mermaid cards, the player immediately wins the game');
            }

            // sort an array of card totals by color (excluding mermaids)
            // for each mermaid, apply 1 point for each card of the color that has the highest count
            // once a mermaid has been used on a color, exclude that color
            const visited_colors = new Set();
            const cards_by_color = getColorFrequency(cards.filter(({ name }) => name !== 'mermaid'))

            for (let i = 0; i < total; i++) {
                for (const [color, count] of Object.entries(cards_by_color)) {
                    if (visited_colors.has(color)) {
                        continue;
                    }

                    points += count;
                    visited_colors.add(color);

                    // only apply a mermaid to one color
                    break;
                }
            }

            return { points, effects };
        },
    },

    // Collector Cards
    shell: {
        eval: (cards) => {
             const scaling = [0, 2, 4, 6, 8, 10]
             const total = cards.filter(({ name }) => name === 'shell').length;
             const points = scaling.at(total - 1) || 0

            return { points, effects: [] }
        }
    },

    octopus: {
        eval: (cards) => {
            const scaling = [0, 3, 6, 9, 12]
            const total = cards.filter(({ name }) => name === 'octopus').length;
            const points = scaling.at(total - 1) || 0

            return { points, effects: [] }
        }
    },

    penguin: {
        eval: (cards) => {
            const scaling =  [1, 3, 5]
            const total = cards.filter(({ name }) => name === 'penguin').length;
            const points = scaling.at(total - 1) || 0

            return { points, effects: [] }
        }
    },

    sailor: {
        eval: (cards) => {
            const scaling = [0, 5]
            const total = cards.filter(({ name }) => name === 'sailor').length;
            const points = scaling.at(total - 1) || 0

            return { points, effects: [] }
        }
    },

    // Point Multiplier Cards
    // 1 point per boat
    lighthouse: {
        eval: (cards) => {
            const factor = 1
            const total = cards.filter(({ name }) => name === 'boat').length;
            const points = (total * factor);

            return { points, effects: [] }
        }
    },

    // 1 point per fish
    'shoal of fish': {
        eval: (cards) => {
            const factor = 1
            const total = cards.filter(({ name }) => name === 'fish').length;
            const points = (total * factor);

            return { points, effects: [] }
        }
    },

    // 2 points per penguin
    'penguin colony': {
        eval: (cards) => {
            const factor = 2
            const total = cards.filter(({ name }) => name === 'penguin').length;
            const points = (total * factor);

            return { points, effects: [] }
        }
    },

    // 3 points per sailor
    'captain': {
        eval: (cards) => {
            const factor = 3
            const total = cards.filter(({ name }) => name === 'sailor').length;
            const points = (total * factor);

            return { points, effects: [] }
        }
    },
}


const turn = (hand: Card[], played: Card[]) => {
    const cards = [...hand, ...played];

    // make a calculation once per card type, at the first appearance of that card
    // if you have already calculated a card type, and you see another instance of that type, continue
    const { state_changes } = cards.reduce((accumulator, currentValue) => {
        if (accumulator.visited.has(currentValue.name)) {
            return accumulator;
        }
        const card_type = card_types[currentValue.name]

        const { points, effects } = card_type.eval(cards)
        accumulator.state_changes.push({ name: currentValue.name, points, effects })
        accumulator.visited.add(currentValue.name)
        return accumulator;
    }, {
        visited: new Set(), state_changes: []
    } as {
        visited: Set<CardName>, state_changes: { name: CardName, points: number, effects: string[] }[]
    })

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

    const color_frequency = getColorFrequency(cards);

    return {
        effects,
        points,
        color_frequency,
    };
}

const [hand_csv, played_csv] = process.argv.slice(2);

console.log(
    turn(
        parse_csv(hand_csv, 'hand'),
        parse_csv(played_csv, 'played')
    )
);
