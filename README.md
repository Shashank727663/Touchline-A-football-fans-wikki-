# Touchline — Premier League player values and match schedule

A small local web app that looks up Premier League squad members through football-data.org and estimates an illustrative transfer value with one ordinary least-squares linear regression.

The Match schedule page shows upcoming fixtures and completed scores, with a team filter and scorer/assist details when the API account includes goal unfolding. football-data.org's documented match resource does not expose a player-of-the-match field, so the app marks MOTM as unreported instead of inventing one.

The Win predictions page fits a three-class logistic model from the current season's finished Premier League matches and displays home-win, draw, and away-win probabilities for today's fixtures. If there are no matches today, it shows the next scheduled matches. The JSON endpoint is `GET /api/predictions`.

## Run locally

1. Create an API token at [football-data.org](https://www.football-data.org/client/register).
2. Install the frontend packages:

   ```sh
   npm install
   ```

3. Start the Python API/model in one terminal:

   ```sh
   python3 server.py
   ```

   The server reads `FOOTBALL_DATA_TOKEN` from the ignored project `.env` file. You can also provide it as an environment variable.

4. Start the React/Vite frontend in another terminal:

   ```sh
   npm run dev
   ```

5. Open the local URL printed by Vite (usually [http://localhost:5173](http://localhost:5173)).

The token stays in the server environment; it is not sent to the browser. The app fetches `/v4/competitions/PL/teams` and reads player names, position, birth date, club and crest from team squads. API access, available competitions, and request limits depend on the football-data.org account tier.

## Model and data limits

football-data.org squad records do not provide reliable individual market values, and this project has no set of observed transfer fees or market values for training. The server therefore trains a single linear regression on a small generated calibration set, using player position, age, appearances and combined goals/assists. The UI asks for appearances and goal contributions because these are not fetched from the squad response. The generated labels encode broad illustrative position/age/performance assumptions; predictions are estimates for exploration, not observed transfer prices. Replace the calibration generator with a sourced, licensed dataset of player valuations before using this as a real valuation model.

Match outcome probabilities are separate from the trade-value regression. They are trained only on finished results from the ongoing season and use each team's pre-match points rate, goal difference rate, scoring and conceding rates, recent form, and home advantage. A multinomial logistic model is used instead of XGBoost because the early-season sample is small; a more flexible boosted model would be prone to overfitting. football-data.org's match feed does not provide xG here, so these are result/form-based probabilities, not xG-based odds. Treat early-season predictions as uncertain.

The Python API uses only the standard library. The frontend uses React and Vite.

## Deploy on Vercel

`api/index.py` exposes all app endpoints under `/api/*` as one Vercel Python Function, delegating to the shared local handler. In Vercel, select the Vite preset, use `pnpm run build`, and set the output directory to `dist`. Add `FOOTBALL_DATA_TOKEN` in the Vercel project's Environment Variables for Preview and Production, then redeploy. Never commit `.env`.
