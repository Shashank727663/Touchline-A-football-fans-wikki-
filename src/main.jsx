import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function ageFromDate(date) {
  if (!date) return 25;
  const born = new Date(date);
  const now = new Date();
  return now.getFullYear() - born.getFullYear() -
    (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate()) ? 1 : 0);
}

function App() {
  const [players, setPlayers] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [age, setAge] = useState(25);
  const [apps, setApps] = useState(20);
  const [goals, setGoals] = useState(5);
  const [assists, setAssists] = useState(4);
  const [estimate, setEstimate] = useState(null);
  const [error, setError] = useState('');
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [dropdown, setDropdown] = useState(false);
  const [page, setPage] = useState('value');
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState('');
  const [matchesRetry, setMatchesRetry] = useState(0);
  const [matchTab, setMatchTab] = useState('upcoming');
  const [teamFilter, setTeamFilter] = useState('');
  const [predictionData, setPredictionData] = useState(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [predictionError, setPredictionError] = useState('');
  const [predictionRetry, setPredictionRetry] = useState(0);
  const [standingsData, setStandingsData] = useState(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsError, setStandingsError] = useState('');
  const [standingsRetry, setStandingsRetry] = useState(0);
  const [headlinesData, setHeadlinesData] = useState(null);
  const [headlinesLoading, setHeadlinesLoading] = useState(false);
  const [headlinesError, setHeadlinesError] = useState('');
  const [headlinesRetry, setHeadlinesRetry] = useState(0);
  const searchRef = useRef(null);

  useEffect(() => {
    fetch('/api/players')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load players.');
        setPlayers(data.players || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingPlayers(false));
  }, []);

  useEffect(() => {
    if (page !== 'matches' || matches.length || matchesLoading) return;
    setMatchesLoading(true);
    fetch('/api/matches')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load match schedule.');
        setMatches(data.matches || []);
      })
      .catch((err) => setMatchesError(err.message))
      .finally(() => setMatchesLoading(false));
  }, [page, matches.length, matchesLoading, matchesRetry]);

  useEffect(() => {
    if (page !== 'predict' || predictionData || predictionLoading) return;
    setPredictionLoading(true);
    fetch('/api/predictions')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not train the match prediction model.');
        setPredictionData(data);
      })
      .catch((err) => setPredictionError(err.message))
      .finally(() => setPredictionLoading(false));
  }, [page, predictionData, predictionLoading, predictionRetry]);

  useEffect(() => {
    if (page !== 'table' || standingsData || standingsLoading) return;
    setStandingsLoading(true);
    fetch('/api/standings')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load the Premier League table.');
        setStandingsData(data);
      })
      .catch((err) => setStandingsError(err.message))
      .finally(() => setStandingsLoading(false));
  }, [page, standingsData, standingsLoading, standingsRetry]);

  useEffect(() => {
    if (page !== 'headlines' || headlinesData || headlinesLoading) return;
    setHeadlinesLoading(true);
    fetch('/api/headlines')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load recent headlines.');
        setHeadlinesData(data);
      })
      .catch((err) => setHeadlinesError(err.message))
      .finally(() => setHeadlinesLoading(false));
  }, [page, headlinesData, headlinesLoading, headlinesRetry]);

  useEffect(() => {
    const dismiss = (event) => {
      if (!searchRef.current?.contains(event.target)) setDropdown(false);
    };
    document.addEventListener('mousedown', dismiss);
    return () => document.removeEventListener('mousedown', dismiss);
  }, []);

  const options = useMemo(() => players
    .filter((player) => player.name?.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 8), [players, query]);

  function choose(player) {
    setSelected(player);
    setQuery(player.name);
    setAge(ageFromDate(player.dateOfBirth));
    setEstimate(null);
    setError('');
    setDropdown(false);
  }

  async function predict(event) {
    event.preventDefault();
    if (!selected) return;
    setPredicting(true);
    setError('');
    try {
      const response = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ age: Number(age), appearances: Number(apps), goals: Number(goals), assists: Number(assists), position: selected.position }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not generate estimate.');
      setEstimate(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setPredicting(false);
    }
  }

  function reset() {
    setSelected(null); setQuery(''); setAge(25); setApps(20); setGoals(5); setAssists(4); setEstimate(null); setError('');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home"><span className="brand-mark">↗</span><span>touchline</span></a>
        <div className="side-label">WORKSPACE</div>
        <button className={`nav-item ${page === 'value' ? 'active' : ''}`} onClick={() => setPage('value')}><span>◉</span>Value estimator</button>
        <button className={`nav-item ${page === 'matches' ? 'active' : ''}`} onClick={() => setPage('matches')}><span>▤</span>Match schedule</button>
        <button className={`nav-item ${page === 'predict' ? 'active' : ''}`} onClick={() => setPage('predict')}><span>◈</span>Win predictions</button>
        <button className={`nav-item ${page === 'table' ? 'active' : ''}`} onClick={() => setPage('table')}><span>≡</span>Points table</button>
        <button className={`nav-item ${page === 'headlines' ? 'active' : ''}`} onClick={() => setPage('headlines')}><span>▧</span>Headlines</button>
        <div className="side-status"><i /> {page === 'matches' || page === 'table' ? 'Live league data' : page === 'headlines' ? 'Recent football news' : page === 'predict' ? 'Current season · match outcomes' : <>Model ready<br /><span>Premier League · Linear regression</span></>}</div>
      </aside>

      <main className="main-content">
        <header className="topline">
          <div className="breadcrumb">Workspace <span>/</span> <b>{{value:'Player valuation',matches:'Match schedule',predict:'Win predictions',table:'Points table',headlines:'Headlines'}[page]}</b></div>
          <div className="competition">ENGLAND <span>·</span> PREMIER LEAGUE</div>
        </header>
        <nav className="page-switcher" aria-label="Main navigation"><button className={page === 'value' ? 'selected' : ''} onClick={() => setPage('value')}>◉ &nbsp;Value</button><button className={page === 'matches' ? 'selected' : ''} onClick={() => setPage('matches')}>▤ &nbsp;Matches</button><button className={page === 'predict' ? 'selected' : ''} onClick={() => setPage('predict')}>◈ &nbsp;Predict</button><button className={page === 'table' ? 'selected' : ''} onClick={() => setPage('table')}>≡ &nbsp;Table</button><button className={page === 'headlines' ? 'selected' : ''} onClick={() => setPage('headlines')}>▧ &nbsp;News</button></nav>
        {page === 'value' ? <>
        <section className="page-heading">
          <div><h1>Player value estimator</h1><p>Explore an indicative transfer value for Premier League players.</p></div>
          <div className="model-badge">↗ &nbsp;LINEAR REGRESSION</div>
        </section>

        <section className="workspace-grid">
          <form className="card profile-card" onSubmit={predict}>
            <div className="card-header"><h2>Player profile</h2><span>01 — INPUTS</span></div>
            <label className="field-label" htmlFor="player-search">Find a player</label>
            <div className="search-wrap" ref={searchRef}>
              <input id="player-search" value={query} placeholder={loadingPlayers ? 'Loading Premier League players…' : 'Start typing a player name…'}
                autoComplete="off" onFocus={() => setDropdown(true)} onChange={(event) => { setQuery(event.target.value); setSelected(null); setEstimate(null); setDropdown(true); }} />
              <span className="search-icon">⌕</span>
              {dropdown && !selected && <div className="suggestions">
                {options.length ? options.map((player) => <button type="button" className="suggestion" key={player.id || `${player.name}-${player.team}`} onClick={() => choose(player)}>
                  {player.crest ? <img src={player.crest} alt="" /> : <span className="crest-placeholder">⚽</span>}
                  <span><b>{player.name}</b><small>{player.team} · {player.position}</small></span>
                </button>) : <div className="suggestion-empty">{loadingPlayers ? 'Connecting to football-data.org…' : players.length ? 'No matching squad players.' : 'Player directory unavailable. Check the API token and restart the server.'}</div>}
              </div>}
            </div>
            {selected && <div className="selected-player">
              {selected.crest && <img src={selected.crest} alt="" />}
              <div><b>{selected.name}</b><small>{selected.team} · {selected.position}</small></div>
            </div>}

            <div className="input-grid">
              <NumberField label="Age" hint="· years" value={age} onChange={setAge} note="Calculated from birth date when available" />
              <NumberField label="League appearances" value={apps} onChange={setApps} note="Current or most recent season" />
              <NumberField label="Goals" value={goals} onChange={setGoals} />
              <NumberField label="Assists" value={assists} onChange={setAssists} />
            </div>
            <div className="actions"><button className="primary-button" disabled={!selected || predicting}>{predicting ? 'Estimating…' : <>Estimate trade value&nbsp; ↗</>}</button><button className="reset-button" type="button" onClick={reset}>Reset</button></div>
            {error && <div className="error-message" role="alert">{error}</div>}
            <div className="source-line">Player directory from <a href="https://www.football-data.org/" target="_blank" rel="noreferrer">football-data.org</a></div>
          </form>

          <section className="card result-card" aria-live="polite">
            <div className="result-heading"><span>ESTIMATED TRANSFER VALUE</span><b>✳</b></div>
            {!estimate ? <div className="empty-result"><div>⚽</div><h3>Your estimate will appear here</h3><p>Select a player, review the inputs, and run the model to see an indicative value.</p></div> : <div className="estimate-result">
              <div className="currency-label">ESTIMATED VALUE · EUR</div>
              <div className="value">€{Number(estimate.valueMillionsEUR).toFixed(1)}<small>m</small></div>
              <div className="value-caption">model estimate · approximate</div>
              <div className="result-player">{selected?.crest && <img src={selected.crest} alt="" />}<div><b>{selected?.name}</b><small>{selected?.team} · {estimate.position} · age {age}</small></div></div>
            </div>}
            <div className="model-note">A single linear regression trained on illustrative calibration values. This is a directional estimate, not a real-world asking price.</div>
          </section>
        </section>

        <section className="info-grid">
          <Info title="MODEL INPUTS">Age, position, appearances and goal contributions shape the estimate. Change the performance inputs to explore different scenarios.</Info>
          <Info title="DATA NOTE">football-data.org supplies the Premier League squad directory. It does not provide dependable player transfer valuations, so the output is illustrative.</Info>
        </section>
        </> : page === 'matches' ? <MatchesPage matches={matches} loading={matchesLoading} error={matchesError} tab={matchTab} setTab={setMatchTab} filter={teamFilter} setFilter={setTeamFilter} onRetry={() => { setMatchesError(''); setMatches([]); setMatchesLoading(false); setMatchesRetry((attempt) => attempt + 1); }} /> : page === 'predict' ? <PredictionsPage data={predictionData} loading={predictionLoading} error={predictionError} onRetry={() => { setPredictionError(''); setPredictionData(null); setPredictionLoading(false); setPredictionRetry((attempt) => attempt + 1); }} /> : page === 'table' ? <StandingsPage data={standingsData} loading={standingsLoading} error={standingsError} onRetry={() => { setStandingsError(''); setStandingsData(null); setStandingsLoading(false); setStandingsRetry((attempt) => attempt + 1); }} /> : <HeadlinesPage data={headlinesData} loading={headlinesLoading} error={headlinesError} onRetry={() => { setHeadlinesError(''); setHeadlinesData(null); setHeadlinesLoading(false); setHeadlinesRetry((attempt) => attempt + 1); }} />}
      </main>
    </div>
  );
}

function NumberField({ label, hint, value, onChange, note }) {
  return <div className="number-field"><label className="field-label">{label} <span>{hint}</span></label><input type="number" min="0" max="100" value={value} onChange={(event) => onChange(event.target.value)} />{note && <small>{note}</small>}</div>;
}

function StandingsPage({ data, loading, error, onRetry }) {
  const table = data?.standings || [];
  const season = data?.season?.startDate && data?.season?.endDate
    ? `${data.season.startDate.slice(0, 4)}/${data.season.endDate.slice(2, 4)}`
    : 'Current season';
  return <section className="standings-page">
    <div className="page-heading">
      <div><h1>Premier League table</h1><p>Current standings, form and goal difference across the league.</p></div>
      <div className="model-badge">{season} · LIVE TABLE</div>
    </div>
    {loading && <div className="matches-message"><span className="loader" /> Loading the current points table…</div>}
    {error && !loading && <div className="matches-message error"><b>Table unavailable</b><span>{error}</span><button onClick={onRetry}>Try again</button></div>}
    {data && !loading && <>
      <div className="table-summary"><span className="table-live-dot" /> Updated standings <span>·</span> {data.competition?.name || 'Premier League'} <span>·</span> {season}</div>
      <div className="standings-wrap"><table className="standings-table">
        <thead><tr><th className="rank-col">#</th><th className="club-col">Club</th><th>MP</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th className="points-col">Pts</th><th className="form-col">Last 5</th></tr></thead>
        <tbody>{table.map((row) => <tr key={row.team?.id || row.position}>
          <td className="rank-col"><span className={`rank-marker ${row.position <= 4 ? 'champions' : row.position >= table.length - 2 ? 'relegation' : ''}`}>{row.position}</span></td>
          <td className="club-col"><div className="table-club">{row.team?.crest && <img src={row.team.crest} alt="" />}<b>{row.team?.shortName || row.team?.name || 'Club'}</b></div></td>
          <td>{row.playedGames}</td><td>{row.won}</td><td>{row.draw}</td><td>{row.lost}</td><td>{row.goalsFor}</td><td>{row.goalsAgainst}</td><td className={row.goalDifference > 0 ? 'positive-gd' : ''}>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td><td className="points-col"><b>{row.points}</b></td>
          <td className="form-col"><div className="form-dots">{(row.form || '').split(',').filter(Boolean).slice(-5).map((result, index) => <span title={result} className={`form-dot form-${result.toLowerCase()}`} key={`${row.team?.id}-${index}`}>{result}</span>)}</div></td>
        </tr>)}</tbody>
      </table></div>
      <div className="table-legend"><span><i className="legend-champions" /> Champions League places</span><span><i className="legend-relegation" /> Relegation zone</span><small>MP played · GD goal difference · Pts points</small></div>
      <div className="matches-footer">Standings provided by <a href="https://www.football-data.org/" target="_blank" rel="noreferrer">football-data.org</a>.</div>
    </>}
  </section>;
}

function HeadlinesPage({ data, loading, error, onRetry }) {
  const headlines = data?.headlines || [];
  const formatDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
  };
  return <section className="headlines-page">
    <div className="page-heading">
      <div><h1>Premier League headlines</h1><p>The latest league stories, refreshed from a football news feed.</p></div>
      {data?.source && <a className="model-badge schedule-source" href="https://www.bbc.com/sport/football/premier-league" target="_blank" rel="noreferrer">{data.source} ↗</a>}
    </div>
    <div className="headlines-intro"><span className="headlines-mark">▧</span><div><b>Latest from around the league</b><small>Headlines open at the original publisher. Check the source for the full story.</small></div></div>
    {loading && <div className="matches-message"><span className="loader" /> Loading recent headlines…</div>}
    {error && !loading && <div className="matches-message error"><b>Headlines unavailable</b><span>{error}</span><button onClick={onRetry}>Try again</button></div>}
    {data && !loading && (headlines.length ? <div className="headline-list">{headlines.map((item, index) => <a className="headline-card" href={item.url} target="_blank" rel="noreferrer" key={`${item.url}-${index}`}>
      <span className="headline-index">{String(index + 1).padStart(2, '0')}</span><span className="headline-copy"><small>{item.source || data.source}{formatDate(item.publishedAt) && ` · ${formatDate(item.publishedAt)}`}</small><b>{item.title}</b></span><span className="headline-arrow">↗</span>
    </a>)}</div> : <div className="matches-message">No recent Premier League headlines were found in the feed.</div>)}
    <div className="matches-footer">Headlines and links from <a href="https://www.bbc.com/sport/football/premier-league" target="_blank" rel="noreferrer">BBC Sport</a>. All stories remain with their publisher.</div>
  </section>;
}

function PredictionsPage({ data, loading, error, onRetry }) {
  const todayGames = data?.predictions?.filter((match) => match.utcDate?.slice(0, 10) === data.date) || [];
  const nextGames = data?.predictions?.filter((match) => match.utcDate?.slice(0, 10) !== data.date).slice(0, 3) || [];
  const showToday = todayGames.length > 0;
  const gamesToShow = showToday ? todayGames : nextGames;
  const dateLabel = data?.date ? new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${data.date}T12:00:00Z`)) : '';
  return <section className="predictions-page">
    <div className="page-heading prediction-heading">
      <div><h1>Who’s more likely to win?</h1><p>Today’s Premier League match probabilities, trained from this season’s results.</p></div>
      <div className="model-badge">◈ &nbsp;SEASON-FORM MODEL</div>
    </div>
    {loading && <div className="matches-message"><span className="loader" /> Loading this season’s results and training the model…</div>}
    {error && !loading && <div className="matches-message error"><b>Predictions unavailable</b><span>{error}</span><button onClick={onRetry}>Try again</button></div>}
    {data && !loading && <>
      <div className="prediction-overview">
        <div><span className="eyebrow">MATCH DAY</span><b>{dateLabel}</b><small>Premier League · {data.season}</small></div>
        <div><span className="eyebrow">TRAINING DATA</span><b>{data.trainingMatches} results</b><small>Completed matches this season</small></div>
        <div><span className="eyebrow">MODEL</span><b>Multinomial logistic</b><small>Three-way outcome probabilities</small></div>
      </div>
      <div className="prediction-callout"><span>i</span><p><b>Early-season estimates.</b> This model trains only on completed matches from {data.season}, using pre-match points rate, goal difference, scoring/conceding rates, recent form, and home advantage. football-data.org does not provide xG in the match feed; estimates can be noisy with a small sample.</p></div>
      <div className="prediction-section-title"><div><h2>{showToday ? 'Today’s fixtures' : 'No Premier League fixtures today'}</h2><p>{showToday ? `${gamesToShow.length} match${gamesToShow.length === 1 ? '' : 'es'} · predicted 1X2 outcome chances` : 'Here are the next scheduled matches with model estimates.'}</p></div></div>
      {gamesToShow.length ? <div className="prediction-list">{gamesToShow.map((match) => <PredictionCard match={match} key={match.id} />)}</div> : <div className="matches-message">No upcoming Premier League matches are currently listed by football-data.org.</div>}
      <div className="prediction-disclaimer">Probabilities are model estimates, not guarantees or betting advice. Current-season-only training is data-limited early in the season.</div>
      <div className="matches-footer">Fixtures and results: <a href="https://www.football-data.org/" target="_blank" rel="noreferrer">football-data.org</a> · <a href="https://docs.football-data.org/general/v4/competition.html" target="_blank" rel="noreferrer">season match API</a>.</div>
    </>}
  </section>;
}

function PredictionCard({ match }) {
  const { home, draw, away } = match.probabilities;
  const homeIsPick = match.pick === 'home'; const awayIsPick = match.pick === 'away';
  const kickoff = new Date(match.utcDate);
  return <article className="prediction-card">
    <div className="prediction-match-head"><div><span>{new Intl.DateTimeFormat(undefined,{weekday:'short',day:'2-digit',month:'short'}).format(kickoff)} · {new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(kickoff)}</span><small>{match.matchday ? `Matchweek ${match.matchday}` : 'Premier League'}</small></div><span className="prediction-tag">{match.confidence.toFixed(1)}% top outcome</span></div>
    <div className="probability-teams">
      <div className={`probability-team ${homeIsPick ? 'most-likely' : ''}`}>{match.homeTeam?.crest && <img src={match.homeTeam.crest} alt="" />}<b>{match.homeTeam?.shortName || match.homeTeam?.name}</b><strong>{home.toFixed(1)}%</strong><small>HOME WIN</small></div>
      <div className={`probability-team draw-team ${match.pick === 'draw' ? 'most-likely' : ''}`}><b>Draw</b><strong>{draw.toFixed(1)}%</strong><small>DRAW</small></div>
      <div className={`probability-team ${awayIsPick ? 'most-likely' : ''}`}>{match.awayTeam?.crest && <img src={match.awayTeam.crest} alt="" />}<b>{match.awayTeam?.shortName || match.awayTeam?.name}</b><strong>{away.toFixed(1)}%</strong><small>AWAY WIN</small></div>
    </div>
    <div className="probability-bar" aria-label={`Home ${home} percent, draw ${draw} percent, away ${away} percent`}><span style={{width:`${home}%`}}/><span style={{width:`${draw}%`}}/><span style={{width:`${away}%`}}/></div>
    <div className="prediction-verdict">Most likely: <b>{homeIsPick ? (match.homeTeam?.shortName || match.homeTeam?.name) : awayIsPick ? (match.awayTeam?.shortName || match.awayTeam?.name) : 'Draw'}</b></div>
  </article>;
}

function MatchDate({ date }) {
  const kickoff = new Date(date);
  return <div className="match-date"><b>{new Intl.DateTimeFormat(undefined, { weekday: 'short', day: '2-digit', month: 'short' }).format(kickoff)}</b><span>{new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(kickoff)}</span></div>;
}

function TeamLine({ team, score, showScore }) {
  return <div className="match-team">
    {team?.crest ? <img src={team.crest} alt="" /> : <span className="match-crest-placeholder">⚽</span>}
    <span className="match-team-name">{team?.shortName || team?.name || 'TBC'}</span>
    {showScore && <b className="team-score">{score ?? '–'}</b>}
  </div>;
}

function MatchesPage({ matches, loading, error, tab, setTab, filter, setFilter, onRetry }) {
  const visibleMatches = useMemo(() => {
    const now = Date.now();
    const q = filter.trim().toLowerCase();
    return matches.filter((match) => {
      const finished = match.status === 'FINISHED';
      if (tab === 'results' ? !finished : !(match.status === 'SCHEDULED' || match.status === 'TIMED' || match.status === 'IN_PLAY' || match.status === 'PAUSED')) return false;
      if (tab === 'upcoming' && new Date(match.utcDate).getTime() < now && !['IN_PLAY', 'PAUSED'].includes(match.status)) return false;
      if (q && !`${match.homeTeam?.name} ${match.homeTeam?.shortName} ${match.awayTeam?.name} ${match.awayTeam?.shortName}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => tab === 'results' ? new Date(b.utcDate) - new Date(a.utcDate) : new Date(a.utcDate) - new Date(b.utcDate));
  }, [matches, tab, filter]);

  return <section className="matches-page">
    <div className="page-heading matches-heading">
      <div><h1>Match schedule</h1><p>Premier League fixtures, kick-off times, scores and match events.</p></div>
      <a className="model-badge schedule-source" href="https://docs.football-data.org/general/v4/match.html" target="_blank" rel="noreferrer">DATA · FOOTBALL-DATA.ORG ↗</a>
    </div>
    <div className="schedule-toolbar">
      <div className="schedule-tabs" role="tablist" aria-label="Match type">
        <button className={tab === 'upcoming' ? 'selected' : ''} onClick={() => setTab('upcoming')} role="tab" aria-selected={tab === 'upcoming'}>Upcoming</button>
        <button className={tab === 'results' ? 'selected' : ''} onClick={() => setTab('results')} role="tab" aria-selected={tab === 'results'}>Results</button>
      </div>
      <label className="team-filter"><span>⌕</span><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by team" aria-label="Filter by team" /></label>
    </div>
    <div className="motm-notice"><span>ⓘ</span><p><b>Player of the match:</b> football-data.org does not include a MOTM field in its match data. We show the source’s reported scorers and assists where available and leave MOTM unassigned.</p></div>
    {error && <div className="matches-message error"><b>Couldn’t load matches</b><span>{error}</span><button onClick={onRetry}>Try again</button></div>}
    {loading && <div className="matches-message"><span className="loader" /> Loading Premier League fixtures…</div>}
    {!loading && !error && visibleMatches.length === 0 && <div className="matches-message">{tab === 'upcoming' ? 'No upcoming fixtures found in this date range.' : 'No completed results found in this date range.'}</div>}
    {!loading && !error && <div className="match-list">{visibleMatches.map((match) => <MatchCard match={match} key={match.id} tab={tab} />)}</div>}
    <div className="matches-footer">Times are shown in your browser’s local timezone. Match data: <a href="https://www.football-data.org/" target="_blank" rel="noreferrer">football-data.org</a>.</div>
  </section>;
}

function MatchCard({ match, tab }) {
  const score = match.score?.fullTime || {};
  const playing = ['IN_PLAY', 'PAUSED'].includes(match.status);
  const hasScore = tab === 'results' || playing;
  const goals = Array.isArray(match.goals) ? match.goals : [];
  const moment = (goal) => goal.minute != null ? `${goal.minute}${goal.injuryTime ? `+${goal.injuryTime}` : ''}′` : '';
  return <article className={`match-card ${playing ? 'live-match' : ''}`}>
    <div className="match-card-main">
      <MatchDate date={match.utcDate} />
      <div className="match-teams">
        <TeamLine team={match.homeTeam} score={score.home} showScore={hasScore} />
        <TeamLine team={match.awayTeam} score={score.away} showScore={hasScore} />
      </div>
      <div className="match-card-meta"><span className={`status-pill ${playing ? 'live' : ''}`}>{playing ? 'LIVE' : tab === 'results' ? 'FULL TIME' : 'UPCOMING'}</span><span>{match.matchday ? `Matchweek ${match.matchday}` : 'Premier League'}</span></div>
    </div>
    {tab === 'results' && <div className="match-events">
      {goals.length ? <div className="goal-events">{goals.map((goal, index) => <span key={`${match.id}-goal-${index}`}>{moment(goal) && <i>{moment(goal)}</i>} {goal.scorer?.name || 'Goal'}{goal.type === 'PENALTY' ? ' (P)' : goal.type === 'OWN' ? ' (OG)' : ''}{goal.assist?.name ? <small> · assist {goal.assist.name}</small> : null}</span>)}</div> : <span className="events-muted">Scorer details unavailable</span>}
      <div className="motm-unset">MOTM <span>Not reported</span></div>
    </div>}
  </article>;
}

function Info({ title, children }) {
  return <article className="info-card"><span>{title}</span><p>{children}</p></article>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
