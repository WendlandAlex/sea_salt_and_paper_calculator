# Sea Salt and Paper Calculator

A tool for scoring a player's cards during one round in the card game [Sea Salt and Paper](https://pandasaurusgames.com/products/sea-salt-and-paper) by [Pandasaurus Games](https://pandasaurusgames.com)

# Gameplay Concepts

A player can have cards in their `hand` (private) and cards that are `played` (public)

Cards provide `points` regardless of whether they are played or in the hand

Some cards provide points in reaction to the player's other cards (e.g., a multiplier on another card's points, or points that scale as a function of the number of cards of the same type)  

Playing a card allows a player to take an `action`

A player can choose to play cards if a precondition is met (e.g, if a complete pair is in the hand, that pair can be played)

A player can choose to end the round if a precondition is met (if they have at least 7 points) 

A player can immediately win the game if a precondition is met (if they have 4 mermaid cards)

# This Calculator

Given the `hand` and `played` cards as inputs, this calculator outputs the following:

- points

- effects
  - these are actions that the player **could** take, but is not required to, based on the state of their cards

- color frequency
  - when scoring at the end of a round, players can earn bonus points based on the highest frequency color among their cards

State is not persisted between rounds. Scoring a round (and making the correct gameplay decisions) is intentionally left to the player

> The outputs reveal the state of a player's hand -- do not show your screen to anyone else! 

# Usage

Inputs are read from csv files having the following schema

```
card_name,color
```

Input values are fuzzy-matched to canonical values in the game rules by Levenshtein Distance

Some misspelling is tolerated, but you should still strive to match the naming in the game rules  

- install Node 24 or higher (required for direct execution of `.ts` files with type stripping)  
- run `npm install`
- create a file `hand.csv`
- create a file `played.csv`
- execute the calculator with `hand.csv` as the first positional argument and `played.csv` as the second positional argument
- When you draw a card, enter it into `hand.csv`, save, and run the calculator
- If you want to take any eligible actions in `.effects`, take them!
- When you play cards, move them from `hand.csv` to `played.csv` and save

To see the intermediate scores from each card as they are calculated, set the environment variable

```
SHOW_STATE_CHANGES=true
```

## Example usage

They player could move their pair of (`shark`, `swimmer`) cards from `hand` to `played` and take an action!

hand.csv
```
fish,dark blue
swimmer,dark blue
shark,violet
```

played.csv
```
crab,yellow
crab,red
```

```shell
> SHOW_STATE_CHANGES=true node index.ts hand.csv played.csv
{
  "name": "fish",
  "points": 0,
  "effects": []
}
{
  "name": "swimmer",
  "points": 0.5,
  "effects": [
    "[If they play a pair of shark, swimmer cards] The player steals a random card from another player and adds it to their hand."
  ]
}
{
  "name": "shark",
  "points": 0.5,
  "effects": [
    "[If they play a pair of shark, swimmer cards] The player steals a random card from another player and adds it to their hand."
  ]
}
{
  "name": "crab",
  "points": 1,
  "effects": []
}
{
  effects: Set(1) {
    '[If they play a pair of shark, swimmer cards] The player steals a random card from another player and adds it to their hand.'
  },
  points: 2,
  color_frequency: { 'dark blue': 2, violet: 1, yellow: 1, red: 1 }
}
```
