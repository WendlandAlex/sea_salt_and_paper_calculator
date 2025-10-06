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

type EvalDuoCard = (name: string, effect: string) => Eval;

type EvalCollectorCard = (name: string, scaling: number[]) => Eval;

type EvalPointMultiplierCard = (name: string, factor: number) => Eval;

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


const getCardsByName = (name: string, cards: Card[]) => {
    const { hand, played } = cards
        .filter((i) => i.name === name)
        .reduce((acc, { state }) => {
            acc[state] += 1
            return acc;
        }, { hand: 0, played: 0 })

    return { hand, played };
}

// cache this calculation which is used by both sharks and swimmers
let sharksAndSwimmers: null | { hand: number, played: number }[] = null;

const getSharksAndSwimmers = (cards: Card[]) => {
    if (sharksAndSwimmers === null) {
        const [shark, swimmer] = ['shark', 'swimmer'].map(
            (name) => {
                const { hand, played } = getCardsByName(name, cards)

                return { hand, played };
            }
        )

        sharksAndSwimmers = [shark, swimmer]
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

        const card = { name, color, state }
        accumulator.push(card);
        return accumulator;
    }, [] as Card[])

const evalDuoCard: EvalDuoCard = (name, effect) => (cards) => {
    let points = 0;
    const effects = [];

    // count cards of this type across hand, played
    const { hand, played } = getCardsByName(name, cards)

    if (Math.floor(hand / 2)) {
        effects.push(effect)
    }

    points += Math.floor((hand + played) / 2)

    return { points, effects };
}

const evalCollectorCard: EvalCollectorCard = (name, scaling) => (cards) => {
    const total = cards.filter((i) => i.name === name).length;
    const points = scaling.at(total - 1) || 0

    return { points, effects: [] }
}

const evalPointMultiplierCard: EvalPointMultiplierCard = (name, factor) => (cards) => {
    const total = cards.filter((i) => i.name === name).length;
    const points = (total * factor);

    return { points, effects: [] }
}

const card_types: CardTypes = {
    // Duo cards
    crab: {
        eval: evalDuoCard(
            'crab',
            '[If they play 2 crab cards] The player chooses a discard pile, consults it without shuffling it, and chooses a card from it to add to their hand. They do not have to show it to the other players'
        ),
    },

    boat: {
        eval: evalDuoCard(
            'boat',
            '[If they play 2 boat cards] The player immediately takes another turn'
        )
    },

    fish: {
        eval: evalDuoCard(
            'fish',
            '[If they play 2 fish cards] The player adds the top card from the deck to their hand.'
            )
    },

    // Shark/Swimmer Duo Card - Special Case
    // complement of shark
    swimmer: {
        eval: (cards) => {
            let points = 0;
            const effects = [];

            const [shark, swimmer] = getSharksAndSwimmers(cards);


            if (shark.hand >= 1 && swimmer.hand >= 1) {
                effects.push('[If they play a pair of shark, swimmer cards] The player steals a random card from another player and adds it to their hand.')
            }

            // the greatest number of pairs you can form is limited by the less frequent of the 2 card types
            const num_pairs = Math.min((shark.hand + shark.played), (swimmer.hand + swimmer.played))

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

            const [shark, swimmer] = getSharksAndSwimmers(cards);


            if (shark.hand >= 1 && swimmer.hand >= 1) {
                effects.push('[If they play a pair of shark, swimmer cards] The player steals a random card from another player and adds it to their hand.')
            }

            // the greatest number of pairs you can form is limited by the less frequent of the 2 card types
            const num_pairs = Math.min((shark.hand + shark.played), (swimmer.hand + swimmer.played))

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
         *
         * # How the calculation is performed
         *  1. Count the frequency of colors in all cards (except mermaids, which technically have color of "white" but are not counted toward frequency)
         *  2. For the first mermaid, add 1 point for each card having the highest-frequency color
         *  3. for the next n mermaids, add 1 point for each card having the nth-highest-frequency-color
         *
         *  # Example
         *  Let the player have 3 mermaids, and cards as [blue, blue, blue, blue, yellow, yellow, light gray]
         *
         *  The first mermaid adds 4 points (from blue cards)
         *
         *  The next mermaid adds 2 points (from yellow cards)
         *
         *  The next mermaid adds 1 point (from light gray)
         *
         *  The total points added is 7
         */
        eval: (cards) => {
            let points = 0;
            const effects = [];

            const total = cards.filter(({ name }) => name === 'mermaid').length;

            if (total === 4) {
                effects.push('If they place 4 mermaid cards, the player immediately wins the game');
            }

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
        eval: evalCollectorCard(
            'shell',
            [0, 2, 4, 6, 8, 10]
        ),
    },

    octopus: {
        eval: evalCollectorCard(
            'octopus',
            [0, 3, 6, 9, 12]
        ),
    },

    penguin: {
        eval: evalCollectorCard(
            'penguin',
            [1, 3, 5]
        )
    },

    sailor: {
        eval: evalCollectorCard(
            'sailor',
            [0, 5]
        )
    },

    // Point Multiplier Cards
    // 1 point per boat
    lighthouse: {
        eval: evalPointMultiplierCard(
            'boat',
            1
        )
    },

    // 1 point per fish
    'shoal of fish': {
        eval: evalPointMultiplierCard(
            'fish',
            1
        )
    },

    // 2 points per penguin
    'penguin colony': {
        eval: evalPointMultiplierCard(
            'penguin',
            2
        )
    },

    // 3 points per sailor
    'captain': {
        eval: evalPointMultiplierCard(
            'sailor',
            3
        )
    }
}


const turn = (hand: Card[], played: Card[]) => {
    const cards = [...hand, ...played];

    // make a calculation once per card type, at the first appearance of that card
    // if you have already calculated a card type, and you see another instance of that type, continue
    const { state_changes } = cards.reduce((accumulator, { name }) => {
        if (accumulator.visited.has(name)) {
            return accumulator;
        }

        const { points, effects } = card_types[name].eval(cards)
        const state_change = { name, points, effects }

        if (process.env.SHOW_STATE_CHANGES === 'true') {
            console.log(JSON.stringify(state_change, null, 2));
        }

        accumulator.state_changes.push(state_change)
        accumulator.visited.add(name)
        return accumulator;
    }, {
        visited: new Set(), state_changes: []
    } as {
        visited: Set<CardName>, state_changes: { name: CardName, points: number, effects: string[] }[]
    })

    // Combine the effects and points from each state change
    //  - effects are de-duplicated
    //  - points are summed
    //      - special case: shark/swimmer pairs emit 0.5 points from each half of a pair - summing should always result in an integer
    const { effects, points } = state_changes.reduce((accumulator, { effects, points }) => {
        for (const effect of (effects || [])) {
            accumulator.effects.add(effect)
        }
        accumulator.points += points
        return accumulator
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
