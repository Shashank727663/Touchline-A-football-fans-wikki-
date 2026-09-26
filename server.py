"""Premier League player trade-value estimator. Run with: python3 server.py"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse, urlencode
from xml.etree import ElementTree
import json, math, os

ROOT = os.path.dirname(os.path.abspath(__file__))
API = "https://api.football-data.org/v4"

def load_local_env():
    """Load simple KEY=VALUE entries from the project-local .env file."""
    env_file=os.path.join(ROOT,".env")
    try:
        with open(env_file,encoding="utf-8") as stream:
            for line in stream:
                line=line.strip()
                if not line or line.startswith("#") or "=" not in line: continue
                key,value=line.split("=",1)
                os.environ.setdefault(key.strip(),value.strip().strip('"').strip("'"))
    except FileNotFoundError: pass

load_local_env()

# A small, transparent synthetic calibration set. football-data.org provides
# squads and performance stats, but not dependable player market values. These
# labels are therefore illustrative calibration values, not observed prices.
def train_model():
    rows=[]
    position_base={"Goalkeeper":7,"Defender":10,"Midfielder":15,"Forward":19}
    for pos, base in position_base.items():
        for age in range(18,36,2):
            for apps in (5,15,25,35):
                for impact in (0,5,12):
                    age_factor=max(.35, 1.22-abs(age-24)*.045)
                    value=max(1.0, base*age_factor + apps*.19 + impact*.42)
                    rows.append((pos,age,apps,impact,value))
    # One ordinary least-squares linear regression using position one-hot,
    # age, appearances and goal contributions. Solve normal equations by
    # Gaussian elimination; no third-party runtime is needed.
    positions=list(position_base)
    x=[[1.0]+[float(r[0]==q) for q in positions[1:]]+[float(r[1]),float(r[2]),float(r[3])] for r in rows]
    y=[r[4] for r in rows]
    n=len(x[0]); a=[[sum(v[i]*v[j] for v in x) for j in range(n)]+[sum(v[i]*t for v,t in zip(x,y))] for i in range(n)]
    for c in range(n):
        pivot=max(range(c,n),key=lambda r:abs(a[r][c]))
        a[c],a[pivot]=a[pivot],a[c]
        d=a[c][c] or 1e-12
        a[c]=[v/d for v in a[c]]
        for r in range(n):
            if r!=c:
                f=a[r][c]
                a[r]=[v-f*w for v,w in zip(a[r],a[c])]
    return positions,[r[-1] for r in a]

POSITIONS, COEFS = train_model()

def estimate(age, position, appearances, goals, assists):
    p=(position or "").lower()
    if "keeper" in p: bucket="Goalkeeper"
    elif any(s in p for s in ("back","defen")): bucket="Defender"
    elif any(s in p for s in ("forward","wing","striker","attack")): bucket="Forward"
    else: bucket="Midfielder"
    feats=[1.0]+[float(bucket==q) for q in POSITIONS[1:]]+[float(age or 25),float(appearances or 0),float((goals or 0)+(assists or 0))]
    return round(max(0.5,sum(c*f for c,f in zip(COEFS,feats))),1),bucket

def api(path, unfold_goals=False):
    token=os.environ.get("FOOTBALL_DATA_TOKEN","").strip()
    if not token: raise RuntimeError("Add your football-data.org API key as FOOTBALL_DATA_TOKEN, then restart the app.")
    headers={"X-Auth-Token":token,"User-Agent":"PLTradeValue/1.0"}
    if unfold_goals: headers["X-Unfold-Goals"]="true"
    req=Request(API+path,headers=headers)
    with urlopen(req,timeout=18) as response: return json.loads(response.read())

def _team_features(home_id, away_id, state):
    """Pre-match season-to-date form features; only earlier results are used."""
    def stats(team_id):
        s=state.get(team_id,{"played":0,"gf":0,"ga":0,"points":0,"form":[]})
        n=max(1,s["played"])
        return s["points"]/n,(s["gf"]-s["ga"])/n,s["gf"]/n,s["ga"]/n,(sum(s["form"][-5:])/max(1,len(s["form"][-5:])))
    h=stats(home_id); a=stats(away_id)
    return [h[0]-a[0],h[1]-a[1],h[2]-a[3],a[2]-h[3],h[4]-a[4],1.0]

def train_outcome_model(matches):
    """Fit regularized 3-class logistic regression on this season's results."""
    from datetime import datetime
    finished=[m for m in matches if m.get("status")=="FINISHED" and m.get("score",{}).get("fullTime",{}).get("home") is not None and m.get("homeTeam",{}).get("id") is not None and m.get("awayTeam",{}).get("id") is not None]
    finished.sort(key=lambda m:m.get("utcDate", ""))
    state={}; samples=[]; labels=[]
    for match in finished:
        home=match["homeTeam"]["id"]; away=match["awayTeam"]["id"]
        samples.append(_team_features(home,away,state))
        hs=match["score"]["fullTime"]["home"]; aws=match["score"]["fullTime"]["away"]
        labels.append(0 if hs>aws else 1 if hs==aws else 2)
        for tid, scored, conceded in ((home,hs,aws),(away,aws,hs)):
            team=state.setdefault(tid,{"played":0,"gf":0,"ga":0,"points":0,"form":[]})
            points=3 if scored>conceded else 1 if scored==conceded else 0
            team["played"]+=1; team["gf"]+=scored; team["ga"]+=conceded; team["points"]+=points; team["form"].append(points)
    if len(samples)<8: return None, len(samples)
    n_features=len(samples[0]); means=[sum(row[j] for row in samples)/len(samples) for j in range(n_features)]
    scales=[]
    for j in range(n_features):
        variance=sum((row[j]-means[j])**2 for row in samples)/len(samples)
        scales.append(math.sqrt(variance) or 1.0)
    xs=[[1.0]+[(row[j]-means[j])/scales[j] for j in range(n_features)] for row in samples]
    weights=[[0.0]*(n_features+1) for _ in range(3)]
    for epoch in range(1600):
        grads=[[0.0]*(n_features+1) for _ in range(3)]
        for row,label in zip(xs,labels):
            logits=[sum(w*x for w,x in zip(class_weights,row)) for class_weights in weights]
            peak=max(logits); exps=[math.exp(v-peak) for v in logits]; denom=sum(exps)
            for k in range(3):
                error=exps[k]/denom-(1.0 if label==k else 0.0)
                for j,x in enumerate(row): grads[k][j]+=error*x
        rate=0.12*(1.0-0.65*epoch/1600)
        for k in range(3):
            for j in range(n_features+1):
                penalty=0.025*weights[k][j] if j else 0.0
                weights[k][j]-=rate*(grads[k][j]/len(xs)+penalty)
    return {"weights":weights,"means":means,"scales":scales},len(samples)

def outcome_probabilities(model, home_id, away_id, state):
    raw=_team_features(home_id,away_id,state)
    row=[1.0]+[(raw[j]-model["means"][j])/model["scales"][j] for j in range(len(raw))]
    logits=[sum(w*x for w,x in zip(class_weights,row)) for class_weights in model["weights"]]
    top=max(logits); probs=[math.exp(v-top) for v in logits]; total=sum(probs)
    return {key:round(p/total*100,1) for key,p in zip(("home","draw","away"),probs)}

def build_current_predictions(matches, today):
    """Train on this season only, then estimate remaining league outcomes."""
    model,training_count=train_outcome_model(matches)
    if model is None: raise ValueError("Not enough completed matches this season to train the outcome model yet.")
    # Rebuild standings/form so predictions use all completed results before today.
    state={}
    finished=sorted((m for m in matches if m.get("status")=="FINISHED" and m.get("score",{}).get("fullTime",{}).get("home") is not None),key=lambda m:m.get("utcDate",""))
    for match in finished:
        home=match["homeTeam"]["id"]; away=match["awayTeam"]["id"]
        match_date=match.get("utcDate","")[:10]
        if match_date>=today.isoformat(): continue
        hs=match["score"]["fullTime"]["home"]; aws=match["score"]["fullTime"]["away"]
        for tid,scored,conceded in ((home,hs,aws),(away,aws,hs)):
            team=state.setdefault(tid,{"played":0,"gf":0,"ga":0,"points":0,"form":[]})
            points=3 if scored>conceded else 1 if scored==conceded else 0
            team["played"]+=1;team["gf"]+=scored;team["ga"]+=conceded;team["points"]+=points;team["form"].append(points)
    output=[]
    for match in matches:
        if match.get("status") not in ("SCHEDULED","TIMED") or match.get("utcDate","")[:10]<today.isoformat(): continue
        h=match.get("homeTeam",{}); a=match.get("awayTeam",{})
        if h.get("id") is None or a.get("id") is None: continue
        probs=outcome_probabilities(model,h["id"],a["id"],state)
        choice=max(probs,key=probs.get)
        output.append({"id":match.get("id"),"utcDate":match.get("utcDate"),"matchday":match.get("matchday"),"homeTeam":h,"awayTeam":a,"probabilities":probs,"pick":choice,"confidence":probs[choice]})
    output.sort(key=lambda x:x.get("utcDate",""))
    return output,training_count

class Handler(BaseHTTPRequestHandler):
    def send_json(self, code, value):
        body=json.dumps(value).encode(); self.send_response(code); self.send_header("Content-Type","application/json; charset=utf-8"); self.send_header("Access-Control-Allow-Origin","*"); self.send_header("Content-Length",str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        path=urlparse(self.path).path
        if path=="/api/players":
            try:
                teams=api("/competitions/PL/teams").get("teams",[])
                players=[]
                for team in teams:
                    for p in team.get("squad",[]):
                        players.append({"id":p.get("id"),"name":p.get("name"),"position":p.get("position") or "Midfielder","dateOfBirth":p.get("dateOfBirth"),"nationality":p.get("nationality"),"team":team.get("shortName") or team.get("name"),"crest":team.get("crest")})
                self.send_json(200,{"players":players,"season":teams[0].get("runningCompetitions",[{}])[0].get("name","Premier League") if teams else "Premier League"})
            except HTTPError as e:
                msg="API key rejected or this endpoint is not included in your football-data.org plan." if e.code in (401,403) else "football-data.org returned an error. Please try again shortly."
                self.send_json(e.code,{"error":msg})
            except (RuntimeError,URLError,TimeoutError) as e: self.send_json(503,{"error":str(e) or "Could not reach football-data.org."})
            except Exception: self.send_json(502,{"error":"Could not load Premier League squads. Check API access and try again."})
        elif path=="/api/matches":
            try:
                from datetime import date, timedelta
                today=date.today()
                start=today-timedelta(days=120)
                end=today+timedelta(days=120)
                params=urlencode({"dateFrom":start.isoformat(),"dateTo":end.isoformat(),"limit":500})
                data=api("/competitions/PL/matches?"+params,unfold_goals=True)
                self.send_json(200,{"matches":data.get("matches",[]),"resultSet":data.get("resultSet",{}),"competition":data.get("competition",{"name":"Premier League","code":"PL"}),"motmAvailable":False})
            except HTTPError as e:
                msg="API key rejected or match schedules are not included in your football-data.org plan." if e.code in (401,403) else "football-data.org returned an error. Please try again shortly."
                self.send_json(e.code,{"error":msg})
            except (RuntimeError,URLError,TimeoutError) as e: self.send_json(503,{"error":str(e) or "Could not reach football-data.org."})
            except Exception: self.send_json(502,{"error":"Could not load Premier League fixtures. Please try again."})
        elif path=="/api/predictions":
            try:
                from datetime import date
                today=date.today()
                season_year=today.year if today.month>=7 else today.year-1
                params=urlencode({"season":season_year,"limit":500})
                data=api("/competitions/PL/matches?"+params)
                predictions,training_count=build_current_predictions(data.get("matches",[]),today)
                self.send_json(200,{"date":today.isoformat(),"season":f"{season_year}/{str(season_year+1)[-2:]}","model":"Current-season multinomial logistic regression","trainingMatches":training_count,"predictions":predictions,"source":"football-data.org"})
            except HTTPError as e:
                msg="API key rejected or this season's match data is not included in your football-data.org plan." if e.code in (401,403) else "football-data.org returned an error. Please try again shortly."
                self.send_json(e.code,{"error":msg})
            except ValueError as e: self.send_json(422,{"error":str(e)})
            except (RuntimeError,URLError,TimeoutError) as e: self.send_json(503,{"error":str(e) or "Could not reach football-data.org."})
            except Exception: self.send_json(502,{"error":"Could not train predictions from this season's results."})
        elif path=="/api/standings":
            try:
                data=api("/competitions/PL/standings")
                total=next((standing for standing in data.get("standings",[]) if standing.get("type")=="TOTAL"),None)
                if not total: raise ValueError("The current Premier League table is not available yet.")
                self.send_json(200,{"competition":data.get("competition",{"name":"Premier League","code":"PL"}),"season":data.get("season",{}),"standings":total.get("table",[]),"updatedAt":data.get("filters",{}).get("date")})
            except HTTPError as e:
                msg="API key rejected or standings are not included in your football-data.org plan." if e.code in (401,403) else "football-data.org returned an error. Please try again shortly."
                self.send_json(e.code,{"error":msg})
            except ValueError as e: self.send_json(503,{"error":str(e)})
            except (RuntimeError,URLError,TimeoutError) as e: self.send_json(503,{"error":str(e) or "Could not reach football-data.org."})
            except Exception: self.send_json(502,{"error":"Could not load the Premier League table."})
        elif path=="/api/headlines":
            try:
                req=Request("https://feeds.bbci.co.uk/sport/football/premier-league/rss.xml",headers={"User-Agent":"TouchlineFootball/1.0"})
                with urlopen(req,timeout=18) as response: root=ElementTree.fromstring(response.read())
                items=[]
                for item in root.findall("./channel/item")[:20]:
                    title=item.findtext("title")
                    link=item.findtext("link")
                    published=item.findtext("pubDate")
                    if title and link: items.append({"title":title,"url":link,"publishedAt":published,"source":"BBC Sport"})
                self.send_json(200,{"headlines":items,"source":"BBC Sport","feed":"Premier League","updatedAt":None})
            except (URLError,TimeoutError) as e: self.send_json(503,{"error":str(e) or "Could not reach the football news feed."})
            except Exception: self.send_json(502,{"error":"Could not load recent Premier League headlines."})
        elif path=="/api/health": self.send_json(200,{"model":"linear_regression","ready":True,"hasApiKey":bool(os.environ.get("FOOTBALL_DATA_TOKEN"))})
        else:
            file=os.path.join(ROOT,"index.html" if path=="/" else path.lstrip("/"))
            if not os.path.isfile(file) or os.path.commonpath([ROOT,os.path.abspath(file)])!=ROOT: self.send_error(404); return
            body=open(file,"rb").read(); self.send_response(200); self.send_header("Content-Type","text/html; charset=utf-8" if file.endswith(".html") else "text/plain"); self.send_header("Content-Length",str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_POST(self):
        if urlparse(self.path).path!="/api/predict": self.send_error(404); return
        try:
            payload=json.loads(self.rfile.read(int(self.headers.get("Content-Length","0"))))
            value,bucket=estimate(payload.get("age",25),payload.get("position","Midfielder"),payload.get("appearances",0),payload.get("goals",0),payload.get("assists",0))
            self.send_json(200,{"valueMillionsEUR":value,"position":bucket,"model":"linear_regression"})
        except Exception: self.send_json(400,{"error":"Enter valid numeric player inputs."})
    def log_message(self,*args): pass

if __name__=="__main__":
    port=int(os.environ.get("PORT","8002")); print(f"PL Trade Value running at http://localhost:{port}"); ThreadingHTTPServer(("127.0.0.1",port),Handler).serve_forever()
