# Pokédex

A Pokédex web app in one HTML file. No install — open `index.html` in a browser.

## Open it

- **https://da.gd/pkedex**
- **https://tinyurl.com/pkedex**

Both are short links with no name in them. They redirect to the live site, so the
address bar shows the full GitHub Pages URL once the page loads.

## Features

- All 1025 Pokémon (Gen 1–9) with sprites, types, stats and real Pokédex entries
- Search by name or number, filter by type and generation/game
- **Cards view**: every Pokémon as a holo trading card with tilt + shine effect
- Click a Pokémon's card to see **every real TCG card ever printed** of it
- Card galleries in 6 languages: English, Japanese, German, French, Spanish, Italian
- Buy page per card: live market prices (USD / EUR / DKK), direct links to the
  exact card on Cardmarket and TCGplayer, eBay search, and card shops
  (Denmark, EU, UK, Japan) that jump straight to the card's product page

## Data sources

- [PokeAPI](https://pokeapi.co) — Pokémon data and Pokédex entries
- [Pokémon TCG API](https://pokemontcg.io) — English cards and prices
- [TCGdex](https://tcgdex.dev) — cards in other languages
- [open.er-api.com](https://www.exchangerate-api.com) — currency rates

Needs internet — all data is fetched live.

## Google login + sync between devices (optional)

The app can sign you in with Google and keep your collection, favorites, caught
list and groups on all your devices. It needs a free Firebase project that only
the site owner can create:

1. Go to https://console.firebase.google.com → **Add project** (any name, Analytics off is fine)
2. In the project: **Build → Authentication → Get started → Sign-in method → Google → Enable** (pick your support email) → Save
3. **Build → Firestore Database → Create database → Start in production mode** → Enable
4. In Firestore → **Rules**, replace with this and press Publish:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /pokedex/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
5. **Project settings (gear icon) → Your apps → Web app (</> icon)** → register (no hosting) → copy the `firebaseConfig = { ... }` object
6. In `index.html`, find `const FIREBASE_CONFIG = null;` and replace `null` with the copied `{ ... }` object
7. **Authentication → Settings → Authorized domains → Add domain**: add your GitHub Pages domain (e.g. `USERNAME.github.io`)
8. Commit + push — a "Sign in with Google" button appears in the app

Every change then saves to your Google account automatically and loads on any
device where you sign in.

## A URL with no name in the address bar (optional)

The short links above redirect, so the long URL still appears once loaded. To get
a clean address that stays clean, pick one:

**Cloudflare Pages — free, gives `pkedex.pages.dev`**
1. Sign up at https://dash.cloudflare.com/sign-up
2. **Workers & Pages → Create → Pages → Connect to Git**
3. Pick this repo, set project name to `pkedex`
4. Framework preset **None**, build command empty, output directory `/`
5. **Save and Deploy** — redeploys automatically on every push

**Rename the GitHub account** — changing the username to e.g. `pkedex` makes the
site `pkedex.github.io/pokedex`. Free, but it breaks every existing link to any
of the account's repos.