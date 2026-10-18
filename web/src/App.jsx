import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  Anchor,
  ArrowRight,
  BadgeCheck,
  Ban,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  Feather,
  Flag,
  Heart,
  Layers,
  LifeBuoy,
  LoaderCircle,
  LogIn,
  LogOut,
  Map,
  MapPin,
  Menu,
  PackageCheck,
  Plus,
  QrCode,
  Search,
  Send,
  Ship,
  Sparkles,
  Stamp,
  UserPlus,
  Users,
  Waves,
  X,
} from "lucide-react";
import { api } from "./api.js";
import {
  duckImage,
  formatDate,
  formatMonthYear,
  formatNumber,
  initials,
  isDuckCode,
  matchRoute,
  normalizeDuckCode,
  serialLabel,
  serialRange,
  slugify,
  statusLine,
  timeAgo,
  typePath,
} from "./lib.js";

const FEATURED_DUCK = "/duck/DP-0427";

const SessionContext = createContext({ user: null, loaded: false, setUser: () => {} });
const useSession = () => useContext(SessionContext);

const faq = [
  ["Do I have to rehide the duck?", "Nope. You can keep it as a souvenir or send it sailing again. If you rehide it, choose a safe public spot and avoid shops, pools, and crew-only areas."],
  ["Can children add a guest-book entry?", "Yes, with a grown-up's help. We recommend using a first name or family nickname and never sharing cabin numbers or other private details."],
  ["What goes on the bottom of the duck?", "A small waterproof label with the Waddle Aboard QR code and short duck ID. Scanning either route takes the finder to the same guest book."],
  ["Does this work without a cruise ship?", "Absolutely. Ducks can visit beaches, road trips, resorts, and hometown adventures too—the ocean is just where Waddle Aboard started."],
];

function navigate(path) {
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (current !== path) window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  const hash = path.split("#")[1];
  if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  else window.scrollTo({ top: 0, behavior: "auto" });
}

function Logo({ onClick }) {
  return (
    <button className="logo" onClick={onClick} aria-label="Waddle Aboard home">
      <span className="logo-mark"><Feather size={21} strokeWidth={2.6} /></span>
      <span>Waddle Aboard</span>
      <small>Every duck has a story</small>
    </button>
  );
}

function Header({ route }) {
  const [open, setOpen] = useState(false);
  const { user, setUser } = useSession();
  const go = (path) => { setOpen(false); navigate(path); };
  const logout = async () => {
    setOpen(false);
    try { await api.logout(); } catch { /* the cookie is cleared server-side either way */ }
    setUser(null);
    navigate("/");
  };
  const links = [
    ["/how-it-works", "How it works"],
    ["/my-flock", "My Flock"],
    [FEATURED_DUCK, "Explore a journey"],
  ];
  return (
    <header className="site-header">
      <div className="nav-shell">
        <Logo onClick={() => go("/")} />
        <nav className={open ? "nav-links is-open" : "nav-links"} aria-label="Main navigation">
          {links.map(([path, label]) => (
            <button key={path} className={route === path ? "active" : ""} onClick={() => go(path)}>{label}</button>
          ))}
          {user?.role === "admin" && <button className={route === "/admin" ? "nav-admin active" : "nav-admin"} onClick={() => go("/admin")}>Admin</button>}
          {user
            ? <button className="nav-admin" onClick={logout}><LogOut size={16} /> Log out</button>
            : <button className={route === "/login" ? "nav-admin active" : "nav-admin"} onClick={() => go("/login")}><LogIn size={16} /> Log in</button>}
          <button className="nav-find" onClick={() => go("/#find")}><Search size={17} /> Find a duck</button>
        </nav>
        <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Logo onClick={() => navigate("/")} />
          <p>A friendly home for cruise ducks, their finders, and every joyful mile in between.</p>
        </div>
        <div>
          <h4>Explore</h4>
          <button onClick={() => navigate("/how-it-works")}>How it works</button>
          <button onClick={() => navigate("/my-flock")}>My Flock</button>
          <button onClick={() => navigate(FEATURED_DUCK)}>Sunny's journey</button>
        </div>
        <div>
          <h4>Community</h4>
          <button onClick={() => navigate("/how-it-works#kindness")}>Hiding safely</button>
          <button onClick={() => navigate("/how-it-works#faq")}>FAQ</button>
          <button onClick={() => navigate("/admin")}>Admin</button>
        </div>
        <div className="footer-note">
          <Waves size={36} />
          <strong>Made for curious travelers.</strong>
          <span>No account needed to sign a guest book</span>
        </div>
      </div>
      <div className="footer-bottom"><span>© 2026 Waddle Aboard</span><span>Keep it kind. Keep it sailing.</span></div>
    </footer>
  );
}

function DuckSearch({ compact = false }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    const normalized = normalizeDuckCode(code);
    if (!normalized) { setError("Enter the code printed under the QR, like DP-0427."); return; }
    if (!isDuckCode(normalized)) { setError("Duck codes look like DP-0427."); return; }
    setBusy(true);
    try {
      await api.duck(normalized);
      navigate(`/duck/${normalized}`);
    } catch (err) {
      setError(err.status === 404 ? `We couldn't find duck ${normalized}. Check the code and try again.` : err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className={compact ? "duck-search compact" : "duck-search"} onSubmit={submit} id={compact ? undefined : "find"}>
      <div className="search-label"><QrCode size={18} /> Found a duck?</div>
      <div className="search-row">
        <input value={code} onChange={(e) => { setCode(e.target.value); setError(""); }} placeholder="Enter duck code" aria-label="Duck code" />
        <button type="submit" disabled={busy}>Open guest book <ArrowRight size={18} /></button>
      </div>
      <span className={error ? "search-help error" : "search-help"} role={error ? "alert" : undefined}>{error || "The short code is printed right below the QR."}</span>
    </form>
  );
}

function Loading({ label = "Loading…" }) {
  return <div className="loading-state" role="status"><LoaderCircle className="spin" size={28} /><span>{label}</span></div>;
}

function usePublicStats() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    let live = true;
    api.stats().then((d) => live && setStats(d.stats)).catch(() => {});
    return () => { live = false; };
  }, []);
  return stats;
}

function HomePage() {
  const stats = usePublicStats();
  return (
    <>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow"><Sparkles size={16} /> A guest book for traveling ducks</span>
            <h1>Small ducks.<br /><em>Big adventures.</em></h1>
            <p>Scan the QR code, sign the guest book, and see how far a little 3D-printed duck can travel.</p>
            <DuckSearch />
            <div className="trust-row">
              <span><BadgeCheck size={17} /> Free for finders</span>
              <span><Heart size={17} /> Family friendly</span>
              <span><MapPin size={17} /> Built for the journey</span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="sun-burst"></div>
            <div className="hero-photo-card">
              <img src="/assets/duckport/sunny-hero.png" alt="Yellow 3D printed duck named Sunny on a cruise ship" />
              <span className="photo-tape tape-one"></span>
              <div className="duck-tag">
                <span className="status-dot"></span>
                <div><strong>Sunny · DP-0427</strong><small>Last seen in Cozumel</small></div>
              </div>
            </div>
            <div className="passport-stamp"><Anchor size={24} /><strong>4 finds</strong><span>1,284 miles</span></div>
            <div className="postcard-note">Bon voyage! <span>↗</span></div>
          </div>
        </section>

        <section className="ticker" aria-label="Community stats">
          <div><strong>{formatNumber(stats?.ducks)}</strong><span>ducks sailing</span></div>
          <i></i><div><strong>{formatNumber(stats?.finds)}</strong><span>guest-book entries</span></div>
          <i></i><div><strong>{formatNumber(stats?.places)}</strong><span>places visited</span></div>
          <i></i><div><strong>∞</strong><span>tiny adventures</span></div>
        </section>

        <section className="section how-preview">
          <div className="section-heading centered">
            <span className="eyebrow coral"><Compass size={16} /> From scan to sail-away</span>
            <h2>One little duck. A whole world of stories.</h2>
            <p>No app download and no account required for finders. A quick scan keeps every chapter together.</p>
          </div>
          <div className="steps-grid">
            {[
              [QrCode, "01", "Scan its tag", "Every duck carries a unique QR code and short ID on its base."],
              [Stamp, "02", "Sign the guest book", "Add when and where you met, plus a photo or a quick hello."],
              [Ship, "03", "Keep or rehide", "Take your new friend home—or choose a safe spot for the next finder."],
            ].map(([Icon, num, title, copy]) => (
              <article className="step-card" key={num}>
                <span className="step-number">{num}</span>
                <div className="step-icon"><Icon size={30} /></div>
                <h3>{title}</h3><p>{copy}</p>
              </article>
            ))}
          </div>
          <button className="text-link" onClick={() => navigate("/how-it-works")}>See the complete guide <ArrowRight size={18} /></button>
        </section>

        <section className="journey-feature">
          <div className="journey-photos">
            <div className="polaroid photo-a"><img src="/assets/duckport/cozumel.png" alt="Cruise duck in Cozumel" /><span>Cozumel · Oct 12</span></div>
            <div className="polaroid photo-b"><img src="/assets/duckport/galveston.png" alt="Cruise duck in Galveston" /><span>Galveston · Oct 8</span></div>
          </div>
          <div className="journey-copy">
            <span className="eyebrow mint"><Map size={16} /> Follow every chapter</span>
            <h2>A tiny travel log,<br />written by strangers.</h2>
            <p>Each scan adds a pin to the journey and a note to the guest book. Over time, one duck becomes a shared story between people who may never meet.</p>
            <blockquote>“Sunny made our sea day! We tucked him by a sunny window for the next explorer.”<cite>— The Ortega family</cite></blockquote>
            <button className="primary" onClick={() => navigate(FEATURED_DUCK)}>Explore Sunny's journey <ArrowRight size={18} /></button>
          </div>
        </section>

        <section className="section flock-preview">
          <div className="flock-card">
            <div className="flock-copy">
              <span className="eyebrow light"><Heart size={16} /> Your traveling collection</span>
              <h2>Meet My Flock.</h2>
              <p>Keep every duck you create or collect in one cheerful place. See its last stop, journey length, and newest guest-book entry.</p>
              <button className="cream-button" onClick={() => navigate("/my-flock")}>View your flock <ArrowRight size={18} /></button>
            </div>
            <div className="flock-image"><img src="/assets/duckport/my-flock.png" alt="A colorful flock of 3D printed ducks" /></div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function AddFindModal({ duck, onClose }) {
  const [form, setForm] = useState({ name: "", place: "", spot: "", note: "", rehidden: "yes" });
  const [photo, setPhoto] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => { setForm({ ...form, [key]: value }); setError(""); };
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.place || !form.note) return;
    const body = new FormData();
    for (const [key, value] of Object.entries(form)) body.set(key, value);
    if (photo) body.set("photo", photo);
    setBusy(true);
    try {
      await api.addFind(duck.code, body);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add your find">
        <button className="modal-close" onClick={onClose} aria-label="Close"><X /></button>
        {saved ? (
          <div className="success-state"><div className="success-icon"><Check size={34} /></div><h2>Your chapter is in!</h2><p>Thanks for signing {duck.name}'s guest book. A moderator will take a quick look, and your entry will appear in the journey once it's approved.</p><button className="primary" onClick={onClose}>Back to the journey</button></div>
        ) : (
          <form onSubmit={submit}>
            <span className="eyebrow coral"><Stamp size={16} /> {duck.name} · {duck.code}</span>
            <h2>Add your find</h2><p>Tell the next traveler where your paths crossed.</p>
            <label>Your name or family nickname<input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. The Parkers" maxLength={80} required /></label>
            <label>Where did you find {duck.name}?<input value={form.place} onChange={(e) => set("place", e.target.value)} placeholder="Ship, port, or city" maxLength={120} required /></label>
            <label>The exact spot <span className="optional">(optional)</span><input value={form.spot} onChange={(e) => set("spot", e.target.value)} placeholder="e.g. Pool deck, by the towel stand" maxLength={160} /></label>
            <label>Leave a note<textarea value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="A quick hello for the guest book…" rows="4" maxLength={1000} required /></label>
            <label className="photo-input"><span><Camera size={16} /> Add a photo <span className="optional">(optional · JPEG, PNG or WebP)</span></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { setPhoto(e.target.files?.[0] || null); setError(""); }} /></label>
            <fieldset><legend>What happened next?</legend><label className="radio"><input type="radio" checked={form.rehidden === "yes"} onChange={() => set("rehidden", "yes")} /> Rehidden for another finder</label><label className="radio"><input type="radio" checked={form.rehidden === "no"} onChange={() => set("rehidden", "no")} /> Came home with me</label></fieldset>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary wide" type="submit" disabled={busy}>{busy ? "Sending…" : "Add to guest book"} <Send size={18} /></button>
            <small className="privacy-note">Please don't include cabin numbers, last names, or contact details.</small>
          </form>
        )}
      </div>
    </div>
  );
}

function DuckNotFound({ code }) {
  return (
    <><main className="not-found duck-not-found"><div><Compass size={46} /><h1>We can't find that duck.</h1><p>No duck with the code <strong>{code}</strong> is sailing with Waddle Aboard. Double-check the code printed under its QR label.</p><DuckSearch compact /></div></main><Footer /></>
  );
}

function DuckPage({ code }) {
  const [state, setState] = useState({ status: "loading" });
  const [modal, setModal] = useState(false);
  useEffect(() => {
    let live = true;
    const normalized = normalizeDuckCode(code);
    setState({ status: "loading" });
    Promise.all([api.duck(normalized), api.finds(normalized)])
      .then(([d, f]) => live && setState({ status: "ready", duck: d.duck, finds: f.finds }))
      .catch((err) => live && setState({ status: err.status === 404 ? "missing" : "error", error: err }));
    return () => { live = false; };
  }, [code]);

  if (state.status === "loading") return <main className="duck-page"><Loading label="Opening the guest book…" /></main>;
  if (state.status === "missing") return <DuckNotFound code={normalizeDuckCode(code)} />;
  if (state.status === "error") return <><main className="not-found"><div><LifeBuoy size={46} /><h1>Choppy waters.</h1><p>{state.error.message}</p><button className="primary" onClick={() => window.location.reload()}>Try again</button></div></main><Footer /></>;

  const { duck, finds } = state;
  const lastSeen = duck.lastSeen || duck.homePort;
  return (
    <>
      <main className="duck-page">
        <section className="duck-hero">
          <div className="duck-portrait"><img src={duckImage(duck)} alt={`${duck.name} the ${(duck.color || "").toLowerCase()} cruise duck`} /><span className="photo-tape"></span></div>
          <div className="duck-summary">
            <span className="eyebrow mint"><span className="status-dot"></span> {statusLine(duck.status)}</span>
            <h1>Meet {duck.name}.</h1>
            <p className="duck-code">
              {duck.type
                ? <><a href={typePath(duck.type.slug)} onClick={(e) => { e.preventDefault(); navigate(typePath(duck.type.slug)); }}>{duck.type.name}</a> · Serial <strong>{duck.serial || duck.code}</strong></>
                : <>Serial <strong>{duck.serial || duck.code}</strong></>}
              {duck.launchedAt && <> · Launched {formatMonthYear(duck.launchedAt)}</>}
            </p>
            <p>{duck.story || `${duck.name} is out collecting bright stories from kind people around the world.`}</p>
            <div className="stat-grid">
              <div><MapPin /><strong>{lastSeen ? lastSeen.split(",")[0] : "Not yet"}</strong><span>last seen</span></div>
              <div><Stamp /><strong>{duck.findCount} {duck.findCount === 1 ? "find" : "finds"}</strong><span>guest book</span></div>
              <div><Waves /><strong>{formatNumber(duck.miles)} mi</strong><span>traveled</span></div>
            </div>
            <button className="primary" onClick={() => setModal(true)}><Stamp size={18} /> I found {duck.name}</button>
          </div>
        </section>
        {(duck.homePort || duck.ship || duck.lastSeen) && (
          <section className="route-strip">
            <div><span className="route-pin start"><Ship /></span><strong>{duck.homePort || "Home port"}</strong><small>Journey started</small></div>
            <i className="route-line"></i>
            <div><span className="route-pin"><Anchor /></span><strong>At sea</strong><small>{duck.ship ? `Aboard ${duck.ship.split(" ")[0]}` : "Between ports"}</small></div>
            <i className="route-line"></i>
            <div><span className="route-pin current"><MapPin /></span><strong>{duck.lastSeen ? duck.lastSeen.split(",")[0] : "Next stop?"}</strong><small>Latest sighting</small></div>
          </section>
        )}
        <section className="guestbook-layout section">
          <div className="guestbook-main">
            <div className="section-heading"><span className="eyebrow coral"><Feather size={16} /> The guest book</span><h2>Notes from the journey</h2><p>Every entry is a small connection between one finder and the next.</p></div>
            <div className="timeline">
              {finds.map((find, idx) => (
                <article className="timeline-entry" key={find.id}>
                  <div className="timeline-marker">{idx === 0 ? <Sparkles /> : <MapPin />}</div>
                  <div className="entry-card">
                    <div className="entry-content">
                      <span className="entry-date">{formatDate(find.date)}</span><h3>{find.place}</h3><p className="entry-spot">{find.spot || (find.rehidden ? "Ready for the next traveler" : "Heading home with a new friend")}</p><blockquote>“{find.note}”</blockquote><span className="finder">— {find.finder}</span>
                    </div>
                    {find.photoUrl && <img src={find.photoUrl} alt={`${duck.name} in ${find.place}`} loading="lazy" />}
                  </div>
                </article>
              ))}
            </div>
            {!finds.length && <div className="empty-state">No guest-book entries yet. Found {duck.name}? Be the first to sign!</div>}
          </div>
          <aside className="journey-aside">
            {duck.ship && <div className="aboard-card"><Ship size={28} /><span>Currently aboard</span><strong>{duck.ship}</strong><small>{duck.status === "At sea" ? "Somewhere at sea" : "Sailing between ports"}</small></div>}
            <div className="kind-card"><Heart size={25} /><h3>Keep the story going</h3><p>If you rehide {duck.name}, choose a safe public spot and never place a duck in shops, pools, or crew-only areas.</p><button onClick={() => navigate("/how-it-works#kindness")}>Read the kindness code <ArrowRight size={16} /></button></div>
          </aside>
        </section>
      </main>
      <Footer />
      {modal && <AddFindModal duck={duck} onClose={() => setModal(false)} />}
    </>
  );
}

function TypePage({ slug }) {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    api.duckType(slug)
      .then((d) => live && setState({ status: "ready", type: d.type, ducks: d.ducks }))
      .catch((err) => live && setState({ status: err.status === 404 ? "missing" : "error", error: err }));
    return () => { live = false; };
  }, [slug]);

  if (state.status === "loading") return <main className="duck-page"><Loading label="Gathering the flock…" /></main>;
  if (state.status === "missing") return <NotFound />;
  if (state.status === "error") return <><main className="not-found"><div><LifeBuoy size={46} /><h1>Choppy waters.</h1><p>{state.error.message}</p><button className="primary" onClick={() => window.location.reload()}>Try again</button></div></main><Footer /></>;

  const { type, ducks } = state;
  return (
    <><main>
      <section className="page-hero flock-hero type-hero">
        <div><span className="eyebrow light"><Layers size={16} /> A Waddle Aboard design</span><h1>{type.name}</h1><p>{type.story || `Every ${type.name} shares the same look, but each one sails its own journey with its own serial number and guest book.`}</p></div>
        <div className="flock-stats"><div><strong>{formatNumber(type.duckCount)}</strong><span>{type.duckCount === 1 ? "duck" : "ducks"}</span></div><div><strong>{formatNumber(type.findCount)}</strong><span>finds</span></div></div>
      </section>
      <section className="section flock-list">
        <div className="flock-toolbar"><div><h2>Every {type.name} afloat</h2><p>Each one has its own serial and guest book.</p></div></div>
        <div className="duck-grid">
          {ducks.map((duck) => <article className={`duck-card ${duck.accent}`} key={duck.serial}>
            <div className="duck-card-image"><img src={duckImage(duck)} alt={`${duck.name}, a ${duck.color} duck`} /><span>{duck.status}</span></div>
            <div className="duck-card-body"><div className="duck-card-title"><div><h3>{duck.name}</h3><span>Serial {duck.serial}</span></div><span className="color-dot"></span></div><p><MapPin size={16} /> {duck.lastSeen || duck.homePort || "Waiting for a first find"}</p><div className="duck-card-stats"><span><strong>{duck.findCount}</strong> finds</span><span><strong>{formatNumber(duck.miles)}</strong> miles</span></div><button onClick={() => navigate(`/duck/${duck.serial}`)}>Open guest book <ArrowRight size={17} /></button></div>
          </article>)}
        </div>
        {!ducks.length && <div className="empty-state">No {type.name} ducks are sailing yet.</div>}
      </section>
    </main><Footer /></>
  );
}

function SignInPrompt({ title, copy, next }) {
  return (
    <div className="empty-state sign-in-prompt">
      <h3>{title}</h3>
      <p>{copy}</p>
      <button className="primary" onClick={() => navigate(`/login?next=${encodeURIComponent(next)}`)}><LogIn size={18} /> Log in</button>
    </div>
  );
}

function FlockPage() {
  const { user, loaded } = useSession();
  const [filter, setFilter] = useState("All ducks");
  const [state, setState] = useState({ status: "idle", ducks: [] });
  useEffect(() => {
    if (!user) return undefined;
    let live = true;
    setState({ status: "loading", ducks: [] });
    api.myDucks()
      .then((d) => live && setState({ status: "ready", ducks: d.ducks }))
      .catch((err) => live && setState({ status: "error", ducks: [], error: err }));
    return () => { live = false; };
  }, [user]);
  const ducks = state.ducks;
  const visible = filter === "All ducks" ? ducks : ducks.filter((duck) => duck.status === filter);
  const totalFinds = ducks.reduce((sum, d) => sum + d.findCount, 0);
  const totalMiles = ducks.reduce((sum, d) => sum + (d.miles || 0), 0);
  const summary = user && state.status === "ready"
    ? `${ducks.length} tiny ${ducks.length === 1 ? "traveler" : "travelers"}. ${totalFinds} guest-book ${totalFinds === 1 ? "note" : "notes"}. One very colorful map.`
    : "Keep every duck you create or collect in one cheerful place.";
  return (
    <><main>
      <section className="page-hero flock-hero"><div><span className="eyebrow light"><Heart size={16} /> Your traveling collection</span><h1>My Flock</h1><p>{summary}</p></div><div className="flock-stats"><div><strong>{user ? ducks.length : "—"}</strong><span>ducks</span></div><div><strong>{user ? totalFinds : "—"}</strong><span>finds</span></div><div><strong>{user ? formatNumber(totalMiles) : "—"}</strong><span>miles</span></div></div></section>
      <section className="section flock-list">
        {!loaded || state.status === "loading" ? <Loading label="Rounding up your flock…" /> : !user ? (
          <SignInPrompt title="Log in to see your flock" copy="Duck owners can follow every duck they've launched. Finders don't need an account to sign a guest book." next="/my-flock" />
        ) : state.status === "error" ? (
          <div className="empty-state">{state.error.message}</div>
        ) : (
          <>
            <div className="flock-toolbar"><div><h2>Where they are now</h2><p>Updated from approved guest-book entries.</p></div><div className="filter-pills">{["All ducks", "Sailing", "Rehidden", "At sea"].map((name) => <button className={filter === name ? "selected" : ""} onClick={() => setFilter(name)} key={name}>{name}</button>)}</div></div>
            <div className="duck-grid">
              {visible.map((duck) => <article className={`duck-card ${duck.accent}`} key={duck.code}>
                <div className="duck-card-image"><img src={duckImage(duck)} alt={`${duck.name}, a ${duck.color} duck`} /><span>{duck.status}</span></div>
                <div className="duck-card-body"><div className="duck-card-title"><div><h3>{duck.name}</h3><span>{serialLabel(duck)}</span></div><span className="color-dot"></span></div><p><MapPin size={16} /> {duck.lastSeen || duck.homePort || "Waiting for a first find"}</p>{duck.ship && <p><Ship size={16} /> {duck.ship}</p>}<div className="duck-card-stats"><span><strong>{duck.findCount}</strong> finds</span><span><strong>{formatNumber(duck.miles)}</strong> miles</span></div><button onClick={() => navigate(`/duck/${duck.code}`)}>Open guest book <ArrowRight size={17} /></button></div>
              </article>)}
            </div>
            {!ducks.length && <div className="empty-state">No ducks in your flock yet. Ask a Waddle Aboard admin to register your first traveler.</div>}
            {!!ducks.length && !visible.length && <div className="empty-state">No ducks match that filter right now. They're a restless little flock.</div>}
          </>
        )}
      </section>
      <section className="cta-band"><div><span className="eyebrow"><QrCode size={16} /> Growing the flock</span><h2>Have a new duck ready to sail?</h2><p>Printable QR labels are coming soon. For now, an admin can register your duck's code.</p></div><button onClick={() => navigate("/how-it-works")}>See what you'll need <ArrowRight size={18} /></button></section>
    </main><Footer /></>
  );
}

function HowPage() {
  const [openFaq, setOpenFaq] = useState(0);
  return (
    <><main>
      <section className="page-hero guide-hero"><div><span className="eyebrow coral"><Compass size={16} /> The Waddle Aboard field guide</span><h1>Ready, set,<br /><em>waddle.</em></h1><p>Everything you need to launch a duck, welcome a finder, and keep the adventure kind.</p></div><div className="guide-hero-art"><div className="guide-qr"><QrCode size={84} /><strong>DP-0427</strong><span>scan the duck</span></div><img src="/assets/duckport/sunny-hero.png" alt="Sunny with a QR label" /></div></section>
      <section className="section guide-steps"><div className="section-heading centered"><span className="eyebrow mint"><Anchor size={16} /> The whole voyage</span><h2>How Waddle Aboard works</h2></div>
        <div className="guide-row"><div className="guide-num">1</div><div className="guide-icon"><PackageCheck /></div><div><h3>Make and register your duck</h3><p>Create your 3D-printed traveler, give it a name, and add a little personality. In the future account experience, you'll register it and download a waterproof QR label.</p></div><span className="coming-pill">Account feature</span></div>
        <div className="guide-row"><div className="guide-num">2</div><div className="guide-icon"><Flag /></div><div><h3>Choose a kind hiding spot</h3><p>Pick a visible public area where the duck won't become a hazard or cause extra work for crew. Add a simple “find me” tag if you like.</p></div></div>
        <div className="guide-row"><div className="guide-num">3</div><div className="guide-icon"><QrCode /></div><div><h3>A finder scans the code</h3><p>The QR opens that duck's public page instantly. No app and no login—the guest book is ready for a quick story.</p></div></div>
        <div className="guide-row"><div className="guide-num">4</div><div className="guide-icon"><Send /></div><div><h3>The story keeps sailing</h3><p>The finder signs the guest book, then chooses to keep the duck or rehide it for the next person. Every stop becomes another chapter.</p></div></div>
      </section>
      <section className="kindness-section" id="kindness"><div className="kindness-copy"><span className="eyebrow light"><Heart size={16} /> The kindness code</span><h2>Fun for finders.<br />Thoughtful for everyone.</h2><p>A few simple choices keep duck hiding joyful for passengers, crew, and the next curious explorer.</p></div><div className="kindness-list">{[[Check,"Do hide in clean, public, easy-to-see areas."],[Check,"Do use a family-friendly note and waterproof label."],[X,"Don't hide in pools, shops, food areas, or restrooms."],[X,"Don't include cabin numbers or personal contact details."]].map(([Icon,text], i)=><div className={i>1?"dont":""} key={text}><Icon /><span>{text}</span></div>)}</div></section>
      <section className="section faq-section" id="faq"><div className="section-heading"><span className="eyebrow coral"><CircleHelp size={16} /> Good to know</span><h2>Frequently asked questions</h2></div><div className="faq-list">{faq.map(([q,a],i)=><article className={openFaq===i?"open":""} key={q}><button onClick={()=>setOpenFaq(openFaq===i?-1:i)}><span>{q}</span><ChevronDown /></button>{openFaq===i&&<p>{a}</p>}</article>)}</div></section>
    </main><Footer /></>
  );
}

const EMPTY_DUCK = { code: "", type: "", name: "", color: "", owner: "" };
const EMPTY_TYPE = { name: "", slug: "", color: "" };
const EMPTY_BATCH = { type: "", count: "1", prefix: "", owner: "" };

function ProvisionCard({ onCreated }) {
  const [types, setTypes] = useState([]);
  const [duck, setDuck] = useState(EMPTY_DUCK);
  const [newType, setNewType] = useState(EMPTY_TYPE);
  const [slugEdited, setSlugEdited] = useState(false);
  const [batch, setBatch] = useState(EMPTY_BATCH);
  const [owner, setOwner] = useState({ username: "", password: "" });
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const loadTypes = useCallback(() => api.duckTypes().then((d) => setTypes(d.types)).catch(() => {}), []);
  useEffect(() => { loadTypes(); }, [loadTypes]);
  const run = async (fn, ok) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await fn();
      setMessage({ ok: true, text: typeof ok === "function" ? ok(result) : ok });
      onCreated?.();
      loadTypes();
      return true;
    } catch (err) {
      setMessage({ ok: false, text: err.message });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const addDuck = async (e) => {
    e.preventDefault();
    const code = normalizeDuckCode(duck.code);
    const body = { code, type: duck.type || undefined, name: duck.name || undefined, color: duck.color || undefined, owner: duck.owner || undefined };
    if (await run(() => api.createDuck(body), `Duck ${code} is ready to sail.`)) setDuck(EMPTY_DUCK);
  };
  const addType = async (e) => {
    e.preventDefault();
    if (await run(() => api.createDuckType(newType), `${newType.name} is now a duck type.`)) {
      setBatch((b) => ({ ...b, type: newType.slug }));
      setNewType(EMPTY_TYPE);
      setSlugEdited(false);
    }
  };
  const register = async (e) => {
    e.preventDefault();
    const body = { count: Number(batch.count), prefix: batch.prefix || undefined, owner: batch.owner || undefined };
    const ok = (r) => `Registered ${r.serials.length} ${r.type.name} ${r.serials.length === 1 ? "duck" : "ducks"}: ${serialRange(r.serials)}.`;
    if (await run(() => api.registerDucks(batch.type, body), ok)) setBatch({ ...EMPTY_BATCH, type: batch.type });
  };
  const addOwner = async (e) => {
    e.preventDefault();
    if (await run(() => api.createUser({ ...owner, role: "owner" }), `Owner ${owner.username} can now log in.`)) {
      setOwner({ username: "", password: "" });
    }
  };
  const typeOptions = types.map((t) => <option key={t.slug} value={t.slug}>{t.name} ({t.slug}) · {t.duckCount}</option>);
  const inherit = Boolean(duck.type);
  return (
    <div className="admin-card admin-form">
      <h3>Register a duck</h3>
      <form onSubmit={addDuck}>
        <label>Serial<input value={duck.code} onChange={(e) => setDuck({ ...duck, code: e.target.value })} placeholder="DP-0428" required /></label>
        <label>Type<select value={duck.type} onChange={(e) => setDuck({ ...duck, type: e.target.value })}><option value="">Match or create from name and color</option>{typeOptions}</select></label>
        <label>Name {inherit && <span className="optional">(optional)</span>}<input value={duck.name} onChange={(e) => setDuck({ ...duck, name: e.target.value })} placeholder={inherit ? "Same as the type" : "Sunny"} maxLength={40} required={!inherit} /></label>
        <label>Color {inherit && <span className="optional">(optional)</span>}<input value={duck.color} onChange={(e) => setDuck({ ...duck, color: e.target.value })} placeholder={inherit ? "Same as the type" : "Marigold"} maxLength={30} required={!inherit} /></label>
        <label>Owner username <span className="optional">(optional)</span><input value={duck.owner} onChange={(e) => setDuck({ ...duck, owner: e.target.value })} placeholder="pat" maxLength={40} /></label>
        <button type="submit" disabled={busy}><Plus size={16} /> Add duck</button>
      </form>
      <h3>New type</h3>
      <form onSubmit={addType}>
        <label>Name<input value={newType.name} onChange={(e) => setNewType({ ...newType, name: e.target.value, slug: slugEdited ? newType.slug : slugify(e.target.value) })} placeholder="Coral" maxLength={40} required /></label>
        <label>Slug<input value={newType.slug} onChange={(e) => { setSlugEdited(true); setNewType({ ...newType, slug: e.target.value }); }} placeholder="coral" pattern="[a-z0-9-]{2,40}" title="2-40 lowercase letters, numbers or dashes" maxLength={40} required /></label>
        <label>Color<input value={newType.color} onChange={(e) => setNewType({ ...newType, color: e.target.value })} placeholder="Coral" maxLength={30} required /></label>
        <button type="submit" disabled={busy}><Layers size={16} /> Add type</button>
      </form>
      <h3>Register N of this type</h3>
      <form onSubmit={register}>
        <label>Type<select value={batch.type} onChange={(e) => setBatch({ ...batch, type: e.target.value })} required><option value="" disabled>Choose a type</option>{typeOptions}</select></label>
        <div className="form-pair">
          <label>How many<input type="number" min={1} max={100} step={1} value={batch.count} onChange={(e) => setBatch({ ...batch, count: e.target.value })} required /></label>
          <label>Prefix <span className="optional">(DP)</span><input value={batch.prefix} onChange={(e) => setBatch({ ...batch, prefix: e.target.value.toUpperCase() })} placeholder="DP" pattern="[A-Za-z]{2,4}" maxLength={4} /></label>
        </div>
        <label>Owner username <span className="optional">(optional)</span><input value={batch.owner} onChange={(e) => setBatch({ ...batch, owner: e.target.value })} placeholder="pat" maxLength={40} /></label>
        <button type="submit" disabled={busy || !batch.type}><PackageCheck size={16} /> Register {Number(batch.count) > 0 ? batch.count : "N"}</button>
      </form>
      <h3>Add an owner</h3>
      <form onSubmit={addOwner}>
        <label>Username<input value={owner.username} onChange={(e) => setOwner({ ...owner, username: e.target.value })} autoComplete="off" required /></label>
        <label>Temporary password<input type="password" value={owner.password} onChange={(e) => setOwner({ ...owner, password: e.target.value })} autoComplete="new-password" minLength={8} required /></label>
        <button type="submit" disabled={busy}><UserPlus size={16} /> Add owner</button>
      </form>
      {message && <p className={message.ok ? "form-ok" : "form-error"} role="status">{message.text}</p>}
    </div>
  );
}

function AdminPage() {
  const { user, loaded } = useSession();
  const [filter, setFilter] = useState("open");
  const [stats, setStats] = useState(null);
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");
  const isAdmin = user?.role === "admin";

  const refresh = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([api.adminStats(), api.adminFinds(filter)]);
      setStats(s.stats);
      setEntries(f.finds);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [filter]);

  useEffect(() => { if (isAdmin) refresh(); }, [isAdmin, refresh]);

  const act = async (id, action) => {
    try {
      const { find } = await api.moderate(id, action);
      setEntries((list) => list.map((e) => (e.id === id ? find : e)));
      const s = await api.adminStats();
      setStats(s.stats);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!loaded) return <main className="admin-page"><Loading /></main>;
  if (!user) return <><main className="admin-page"><SignInPrompt title="Admins only" copy="Log in with your admin account to moderate guest-book entries." next="/admin" /></main><Footer /></>;
  if (!isAdmin) return <><main className="admin-page"><div className="empty-state"><h3>Admins only</h3><p>You're logged in as {user.username}, which doesn't have admin access.</p><button className="primary" onClick={() => navigate("/my-flock")}>Go to My Flock</button></div></main><Footer /></>;

  const fleet = stats?.fleet || { total: 0, active: 0, quiet: 0, retired: 0 };
  const activePct = fleet.total ? Math.round((fleet.active / fleet.total) * 100) : 0;
  const name = user.displayName || user.username;
  const open = (entries || []).filter((e) => e.status === "pending" || e.status === "flagged").length;
  return (
    <><main className="admin-page">
      <section className="admin-header"><div><span className="eyebrow mint"><BadgeCheck size={16} /> Community admin</span><h1>Good morning, Captain.</h1><p>Here's what's happening across Waddle Aboard today.</p></div><div className="admin-profile"><span>{initials(name)}</span><div><strong>{name}</strong><small>Community admin</small></div></div></section>
      <section className="admin-stats">{[[Users, stats?.activeDucks, "Active ducks", `+${stats?.ducksThisWeek ?? 0} this week`], [Stamp, stats?.approvedFinds, "Guest-book entries", `+${stats?.findsThisWeek ?? 0} submitted this week`], [MapPin, stats?.places, "Places visited", "From approved finds"], [Flag, stats?.needsReview, "Needs review", "Moderation queue"]].map(([Icon, num, label, meta]) => <article key={label}><Icon /><div><strong>{formatNumber(num)}</strong><span>{label}</span><small>{meta}</small></div></article>)}</section>
      {error && <p className="form-error admin-error" role="alert">{error}</p>}
      <section className="admin-grid"><div className="moderation-panel"><div className="panel-heading"><div><h2>Moderation queue</h2><p>{filter === "open" ? "Guest-book entries awaiting review." : filter === "flagged" ? "Entries flagged for a closer look." : "Every guest-book entry."}</p></div><span>{open} open</span></div>
        <div className="filter-pills queue-filter">{[["open", "Open"], ["flagged", "Flagged"], ["all", "All"]].map(([key, label]) => <button key={key} className={filter === key ? "selected" : ""} onClick={() => setFilter(key)}>{label}</button>)}</div>
        <div className="admin-table"><div className="table-head"><span>Finder</span><span>Duck & location</span><span>Submitted</span><span>Status</span><span></span></div>
          {entries === null && <Loading />}
          {entries?.length === 0 && <div className="table-empty">Nothing waiting. The guest books are shipshape.</div>}
          {entries?.map((entry) => <div className="table-row" key={entry.id}>
            <span><strong>{entry.finder}</strong><small title={entry.note}>“{entry.note}”</small>{entry.photoUrl && <a href={entry.photoUrl} target="_blank" rel="noreferrer" className="photo-link"><Camera size={13} /> Photo</a>}</span>
            <span><strong>{entry.duck.name}</strong><small>{entry.place}{entry.spot ? ` · ${entry.spot}` : ""}</small></span>
            <span>{timeAgo(entry.date)}</span>
            <span><b className={`status ${entry.status}`}>{entry.status[0].toUpperCase() + entry.status.slice(1)}</b></span>
            <span className="row-actions">{entry.status !== "approved" ? <button onClick={() => act(entry.id, "approve")}><Check size={16} /> Approve</button> : <BadgeCheck size={20} />}{entry.status === "pending" && <button className="flag" onClick={() => act(entry.id, "flag")} aria-label={`Flag entry from ${entry.finder}`}><Flag size={14} /></button>}{entry.status !== "rejected" && <button className="reject" onClick={() => act(entry.id, "reject")} aria-label={`Reject entry from ${entry.finder}`}><Ban size={14} /></button>}</span>
          </div>)}
        </div></div>
        <aside className="admin-aside"><div className="admin-card"><h3>Fleet health</h3><div className="donut" style={{ background: `conic-gradient(var(--mint) 0 ${activePct}%, #e6ebef ${activePct}%)` }}><span><strong>{activePct}%</strong><small>active</small></span></div><ul><li><i className="live"></i>Active <strong>{formatNumber(fleet.active)}</strong></li><li><i className="quiet"></i>Quiet 30+ days <strong>{formatNumber(fleet.quiet)}</strong></li><li><i className="retired"></i>Retired or adopted <strong>{formatNumber(fleet.retired)}</strong></li></ul></div><div className="admin-card quick"><h3>Quick actions</h3><button disabled title="Coming soon"><QrCode /> Generate label batch · coming soon</button><button onClick={() => setFilter("flagged")}><LifeBuoy /> Review reported entries</button><button onClick={() => navigate(FEATURED_DUCK)}><Search /> View public journey</button></div><ProvisionCard onCreated={refresh} /></aside>
      </section>
      <section className="static-notice"><Sparkles /><div><strong>New entries wait here until you approve them.</strong><span>Approved entries appear in the duck's public guest book right away. Rejected and flagged entries stay hidden.</span></div></section>
    </main><Footer /></>
  );
}

function LoginPage() {
  const { setUser } = useSession();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = new URLSearchParams(window.location.search).get("next");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { user } = await api.login(form.username, form.password);
      setUser(user);
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
      navigate(safeNext || (user.role === "admin" ? "/admin" : "/my-flock"));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <><main className="login-page">
      <div className="modal auth-card">
        <form onSubmit={submit}>
          <span className="eyebrow coral"><LogIn size={16} /> Owners & admins</span>
          <h2>Welcome aboard</h2><p>Log in to manage your flock or moderate guest books. Finders never need an account.</p>
          <label>Username<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" required /></label>
          <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary wide" type="submit" disabled={busy}>{busy ? "Logging in…" : "Log in"} <ArrowRight size={18} /></button>
        </form>
      </div>
    </main><Footer /></>
  );
}

function NotFound() {
  return <main className="not-found"><div><Compass size={46}/><h1>That duck wandered off.</h1><p>The page you're looking for isn't on this sailing.</p><button className="primary" onClick={()=>navigate("/")}>Return to Waddle Aboard</button></div></main>;
}

export function App() {
  const [route, setRoute] = useState(window.location.pathname);
  const [user, setUser] = useState(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { const update = () => setRoute(window.location.pathname); window.addEventListener("popstate", update); return () => window.removeEventListener("popstate", update); }, []);
  useEffect(() => {
    api.me().then((d) => setUser(d.user)).catch(() => setUser(null)).finally(() => setLoaded(true));
  }, []);
  const session = useMemo(() => ({ user, loaded, setUser }), [user, loaded]);
  const page = useMemo(() => {
    const { name, params } = matchRoute(route);
    if (name === "home") return <HomePage />;
    if (name === "duck") return <DuckPage key={params.code} code={params.code} />;
    if (name === "type") return <TypePage key={params.slug} slug={params.slug} />;
    if (name === "flock") return <FlockPage />;
    if (name === "how") return <HowPage />;
    if (name === "admin") return <AdminPage />;
    if (name === "login") return <LoginPage />;
    return <NotFound />;
  }, [route]);
  return <SessionContext.Provider value={session}><div className="app"><Header route={route} />{page}</div></SessionContext.Provider>;
}
