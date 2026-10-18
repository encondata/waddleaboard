import { useEffect, useMemo, useState } from "react";
import {
  Anchor,
  ArrowRight,
  BadgeCheck,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  Feather,
  Flag,
  Heart,
  LifeBuoy,
  Map,
  MapPin,
  Menu,
  PackageCheck,
  QrCode,
  Search,
  Send,
  Ship,
  Sparkles,
  Stamp,
  Users,
  Waves,
  X,
} from "lucide-react";

const ducks = [
  {
    code: "DP-0427",
    name: "Sunny",
    color: "Marigold",
    status: "Sailing",
    location: "Cozumel, Mexico",
    ship: "Harmony of the Seas",
    miles: "1,284",
    finds: 4,
    image: "/assets/duckport/sunny-hero.png",
    accent: "gold",
  },
  {
    code: "DP-0912",
    name: "Coral",
    color: "Coral",
    status: "On shore",
    location: "Nassau, Bahamas",
    ship: "Wonder of the Seas",
    miles: "862",
    finds: 3,
    image: "/assets/duckport/coral-portrait.png",
    accent: "coral",
  },
  {
    code: "DP-1180",
    name: "Minty",
    color: "Seafoam",
    status: "Rehidden",
    location: "St. Thomas, USVI",
    ship: "Celebrity Beyond",
    miles: "2,016",
    finds: 6,
    image: "/assets/duckport/minty-portrait.png",
    accent: "mint",
  },
  {
    code: "DP-1564",
    name: "Skipper",
    color: "Blue",
    status: "At sea",
    location: "Caribbean Sea",
    ship: "Carnival Jubilee",
    miles: "734",
    finds: 2,
    image: "/assets/duckport/blue-portrait.png",
    accent: "blue",
  },
];

const initialFinds = [
  {
    id: 1,
    date: "October 12, 2026",
    place: "Cozumel, Mexico",
    spot: "Near the pool deck, after a very serious taco lunch",
    finder: "The Ortega family",
    note: "Sunny made our sea day! We signed the log and tucked him near a sunny window for the next explorer.",
    image: "/assets/duckport/cozumel.png",
  },
  {
    id: 2,
    date: "October 8, 2026",
    place: "Galveston, Texas",
    spot: "Terminal 10, waiting to board",
    finder: "Maya & Luis",
    note: "Our first cruise duck! Sunny came aboard with us and started his big adventure before sail-away.",
    image: "/assets/duckport/galveston.png",
  },
];

const faq = [
  ["Do I have to rehide the duck?", "Nope. You can keep it as a souvenir or send it sailing again. If you rehide it, choose a safe public spot and avoid shops, pools, and crew-only areas."],
  ["Can children add a guest-book entry?", "Yes, with a grown-up's help. We recommend using a first name or family nickname and never sharing cabin numbers or other private details."],
  ["What goes on the bottom of the duck?", "A small waterproof label with the Waddle Aboard QR code and short duck ID. Scanning either route takes the finder to the same guest book."],
  ["Does this work without a cruise ship?", "Absolutely. Ducks can visit beaches, road trips, resorts, and hometown adventures too—the ocean is just where Waddle Aboard started."],
];

function navigate(path) {
  if (window.location.pathname !== path) window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "auto" });
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
  const go = (path) => { setOpen(false); navigate(path); };
  const links = [
    ["/how-it-works", "How it works"],
    ["/my-flock", "My Flock"],
    ["/duck/DP-0427", "Explore a journey"],
  ];
  return (
    <header className="site-header">
      <div className="nav-shell">
        <Logo onClick={() => go("/")} />
        <nav className={open ? "nav-links is-open" : "nav-links"} aria-label="Main navigation">
          {links.map(([path, label]) => (
            <button key={path} className={route === path ? "active" : ""} onClick={() => go(path)}>{label}</button>
          ))}
          <button className="nav-admin" onClick={() => go("/admin")}>Admin demo</button>
          <button className="nav-find" onClick={() => go("/duck/DP-0427")}><Search size={17} /> Find a duck</button>
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
          <button onClick={() => navigate("/duck/DP-0427")}>Sunny's journey</button>
        </div>
        <div>
          <h4>Community</h4>
          <button onClick={() => navigate("/how-it-works#kindness")}>Hiding safely</button>
          <button onClick={() => navigate("/how-it-works#faq")}>FAQ</button>
          <button onClick={() => navigate("/admin")}>Admin demo</button>
        </div>
        <div className="footer-note">
          <Waves size={36} />
          <strong>Made for curious travelers.</strong>
          <span>Static prototype · no account needed</span>
        </div>
      </div>
      <div className="footer-bottom"><span>© 2026 Waddle Aboard</span><span>Keep it kind. Keep it sailing.</span></div>
    </footer>
  );
}

function DuckSearch({ compact = false }) {
  const [code, setCode] = useState(compact ? "" : "DP-0427");
  const [error, setError] = useState("");
  const submit = (event) => {
    event.preventDefault();
    const normalized = code.trim().toUpperCase().replace(/\s/g, "");
    if (["DP-0427", "0427", "SUNNY"].includes(normalized)) {
      navigate("/duck/DP-0427");
    } else {
      setError("Try the sample code DP-0427");
    }
  };
  return (
    <form className={compact ? "duck-search compact" : "duck-search"} onSubmit={submit}>
      <div className="search-label"><QrCode size={18} /> Found a duck?</div>
      <div className="search-row">
        <input value={code} onChange={(e) => { setCode(e.target.value); setError(""); }} placeholder="Enter duck code" aria-label="Duck code" />
        <button type="submit">Open guest book <ArrowRight size={18} /></button>
      </div>
      <span className={error ? "search-help error" : "search-help"}>{error || "The short code is printed right below the QR."}</span>
    </form>
  );
}

function HomePage() {
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
          <div><strong>2,806</strong><span>ducks sailing</span></div>
          <i></i><div><strong>18,492</strong><span>guest-book entries</span></div>
          <i></i><div><strong>64</strong><span>countries visited</span></div>
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
            <button className="primary" onClick={() => navigate("/duck/DP-0427")}>Explore Sunny's journey <ArrowRight size={18} /></button>
          </div>
        </section>

        <section className="section flock-preview">
          <div className="flock-card">
            <div className="flock-copy">
              <span className="eyebrow light"><Heart size={16} /> Your traveling collection</span>
              <h2>Meet My Flock.</h2>
              <p>Keep every duck you create or collect in one cheerful place. See its last stop, journey length, and newest guest-book entry.</p>
              <button className="cream-button" onClick={() => navigate("/my-flock")}>View the sample flock <ArrowRight size={18} /></button>
            </div>
            <div className="flock-image"><img src="/assets/duckport/my-flock.png" alt="A colorful flock of 3D printed ducks" /></div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function AddFindModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: "", place: "", note: "", rehidden: "yes" });
  const [saved, setSaved] = useState(false);
  const set = (key, value) => setForm({ ...form, [key]: value });
  const submit = (e) => {
    e.preventDefault();
    if (!form.name || !form.place || !form.note) return;
    onSave(form); setSaved(true);
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add your find">
        <button className="modal-close" onClick={onClose} aria-label="Close"><X /></button>
        {saved ? (
          <div className="success-state"><div className="success-icon"><Check size={34} /></div><h2>Your chapter is in!</h2><p>Sunny's guest book has one more story. In the future, this entry would enter the moderation queue before publishing.</p><button className="primary" onClick={onClose}>Back to the journey</button></div>
        ) : (
          <form onSubmit={submit}>
            <span className="eyebrow coral"><Stamp size={16} /> Sunny · DP-0427</span>
            <h2>Add your find</h2><p>Tell the next traveler where your paths crossed.</p>
            <label>Your name or family nickname<input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. The Parkers" required /></label>
            <label>Where did you find Sunny?<input value={form.place} onChange={(e) => set("place", e.target.value)} placeholder="Ship, port, or city" required /></label>
            <label>Leave a note<textarea value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="A quick hello for the guest book…" rows="4" required /></label>
            <fieldset><legend>What happened next?</legend><label className="radio"><input type="radio" checked={form.rehidden === "yes"} onChange={() => set("rehidden", "yes")} /> Rehidden for another finder</label><label className="radio"><input type="radio" checked={form.rehidden === "no"} onChange={() => set("rehidden", "no")} /> Came home with me</label></fieldset>
            <button className="primary wide" type="submit">Add to guest book <Send size={18} /></button>
            <small className="privacy-note">Please don't include cabin numbers, last names, or contact details.</small>
          </form>
        )}
      </div>
    </div>
  );
}

function DuckPage() {
  const [finds, setFinds] = useState(initialFinds);
  const [modal, setModal] = useState(false);
  const addFind = (form) => setFinds([{ id: Date.now(), date: "Just now", place: form.place, spot: form.rehidden === "yes" ? "Ready for the next traveler" : "Heading home with a new friend", finder: form.name, note: form.note, image: null }, ...finds]);
  return (
    <>
      <main className="duck-page">
        <section className="duck-hero">
          <div className="duck-portrait"><img src="/assets/duckport/sunny-hero.png" alt="Sunny the yellow cruise duck" /><span className="photo-tape"></span></div>
          <div className="duck-summary">
            <span className="eyebrow mint"><span className="status-dot"></span> Currently sailing</span>
            <h1>Meet Sunny.</h1>
            <p className="duck-code">Duck <strong>DP-0427</strong> · Launched October 2026</p>
            <p>Sunny began his voyage in Galveston with one mission: collect bright stories from kind people around the world.</p>
            <div className="stat-grid">
              <div><MapPin /><strong>Cozumel</strong><span>last seen</span></div>
              <div><Stamp /><strong>{finds.length + 2} finds</strong><span>guest book</span></div>
              <div><Waves /><strong>1,284 mi</strong><span>traveled</span></div>
            </div>
            <button className="primary" onClick={() => setModal(true)}><Stamp size={18} /> I found Sunny</button>
          </div>
        </section>
        <section className="route-strip">
          <div><span className="route-pin start"><Ship /></span><strong>Galveston</strong><small>Journey started</small></div>
          <i className="route-line"></i>
          <div><span className="route-pin"><Anchor /></span><strong>At sea</strong><small>Aboard Harmony</small></div>
          <i className="route-line"></i>
          <div><span className="route-pin current"><MapPin /></span><strong>Cozumel</strong><small>Latest sighting</small></div>
        </section>
        <section className="guestbook-layout section">
          <div className="guestbook-main">
            <div className="section-heading"><span className="eyebrow coral"><Feather size={16} /> The guest book</span><h2>Notes from the journey</h2><p>Every entry is a small connection between one finder and the next.</p></div>
            <div className="timeline">
              {finds.map((find, idx) => (
                <article className="timeline-entry" key={find.id}>
                  <div className="timeline-marker">{idx === 0 ? <Sparkles /> : <MapPin />}</div>
                  <div className="entry-card">
                    <div className="entry-content">
                      <span className="entry-date">{find.date}</span><h3>{find.place}</h3><p className="entry-spot">{find.spot}</p><blockquote>“{find.note}”</blockquote><span className="finder">— {find.finder}</span>
                    </div>
                    {find.image && <img src={find.image} alt={`Sunny in ${find.place}`} />}
                  </div>
                </article>
              ))}
            </div>
          </div>
          <aside className="journey-aside">
            <div className="aboard-card"><Ship size={28} /><span>Currently aboard</span><strong>Harmony of the Seas</strong><small>Western Caribbean sailing</small></div>
            <div className="kind-card"><Heart size={25} /><h3>Keep the story going</h3><p>If you rehide Sunny, choose a safe public spot and never place a duck in shops, pools, or crew-only areas.</p><button onClick={() => navigate("/how-it-works#kindness")}>Read the kindness code <ArrowRight size={16} /></button></div>
          </aside>
        </section>
      </main>
      <Footer />
      {modal && <AddFindModal onClose={() => setModal(false)} onSave={addFind} />}
    </>
  );
}

function FlockPage() {
  const [filter, setFilter] = useState("All ducks");
  const visible = filter === "All ducks" ? ducks : ducks.filter((duck) => duck.status === filter);
  return (
    <><main>
      <section className="page-hero flock-hero"><div><span className="eyebrow light"><Heart size={16} /> Your traveling collection</span><h1>My Flock</h1><p>Four tiny travelers. Fifteen guest-book notes. One very colorful map.</p></div><div className="flock-stats"><div><strong>4</strong><span>ducks</span></div><div><strong>15</strong><span>finds</span></div><div><strong>4,896</strong><span>miles</span></div></div></section>
      <section className="section flock-list">
        <div className="flock-toolbar"><div><h2>Where they are now</h2><p>Last updated from the sample guest books.</p></div><div className="filter-pills">{["All ducks", "Sailing", "Rehidden", "At sea"].map((name) => <button className={filter === name ? "selected" : ""} onClick={() => setFilter(name)} key={name}>{name}</button>)}</div></div>
        <div className="duck-grid">
          {visible.map((duck) => <article className={`duck-card ${duck.accent}`} key={duck.code}>
            <div className="duck-card-image"><img src={duck.image} alt={`${duck.name}, a ${duck.color} duck`} /><span>{duck.status}</span></div>
            <div className="duck-card-body"><div className="duck-card-title"><div><h3>{duck.name}</h3><span>{duck.code}</span></div><span className="color-dot"></span></div><p><MapPin size={16} /> {duck.location}</p><p><Ship size={16} /> {duck.ship}</p><div className="duck-card-stats"><span><strong>{duck.finds}</strong> finds</span><span><strong>{duck.miles}</strong> miles</span></div><button onClick={() => navigate("/duck/DP-0427")}>Open guest book <ArrowRight size={17} /></button></div>
          </article>)}
        </div>
        {!visible.length && <div className="empty-state">No ducks are on shore right now. They're a restless little flock.</div>}
      </section>
      <section className="cta-band"><div><span className="eyebrow"><QrCode size={16} /> Growing the flock</span><h2>Have a new duck ready to sail?</h2><p>Registration and printable QR labels are coming in the account-enabled release.</p></div><button onClick={() => navigate("/how-it-works")}>See what you'll need <ArrowRight size={18} /></button></section>
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

function AdminPage() {
  const [entries, setEntries] = useState([
    { id: 1, finder: "The Parkers", duck: "Sunny", place: "Costa Maya, Mexico", time: "12 min ago", status: "Pending" },
    { id: 2, finder: "Jules & Sam", duck: "Coral", place: "Nassau, Bahamas", time: "48 min ago", status: "Pending" },
    { id: 3, finder: "Nana B.", duck: "Minty", place: "St. Thomas, USVI", time: "2 hr ago", status: "Flagged" },
  ]);
  const approve = (id) => setEntries(entries.map((e) => e.id === id ? { ...e, status: "Approved" } : e));
  return (
    <><main className="admin-page">
      <section className="admin-header"><div><span className="eyebrow mint"><BadgeCheck size={16} /> Static admin preview</span><h1>Good morning, Captain.</h1><p>Here's what's happening across Waddle Aboard today.</p></div><div className="admin-profile"><span>JD</span><div><strong>Jamie Duckworth</strong><small>Community admin</small></div></div></section>
      <section className="admin-stats">{[[Users,"2,806","Active ducks","+12 this week"],[Stamp,"18,492","Guest-book entries","+94 this week"],[MapPin,"64","Countries reached","+2 this month"],[Flag,"3","Needs review","Moderation queue"]].map(([Icon,num,label,meta])=><article key={label}><Icon /><div><strong>{num}</strong><span>{label}</span><small>{meta}</small></div></article>)}</section>
      <section className="admin-grid"><div className="moderation-panel"><div className="panel-heading"><div><h2>Moderation queue</h2><p>Recent guest-book entries awaiting review.</p></div><span>{entries.filter(e=>e.status==="Pending"||e.status==="Flagged").length} open</span></div><div className="admin-table"><div className="table-head"><span>Finder</span><span>Duck & location</span><span>Submitted</span><span>Status</span><span></span></div>{entries.map(entry=><div className="table-row" key={entry.id}><span><strong>{entry.finder}</strong></span><span><strong>{entry.duck}</strong><small>{entry.place}</small></span><span>{entry.time}</span><span><b className={`status ${entry.status.toLowerCase()}`}>{entry.status}</b></span><span>{entry.status!=="Approved"?<button onClick={()=>approve(entry.id)}><Check size={16}/> Approve</button>:<BadgeCheck size={20}/>}</span></div>)}</div></div>
        <aside className="admin-aside"><div className="admin-card"><h3>Fleet health</h3><div className="donut"><span><strong>92%</strong><small>active</small></span></div><ul><li><i className="live"></i>Active <strong>2,582</strong></li><li><i className="quiet"></i>Quiet 30+ days <strong>196</strong></li><li><i className="retired"></i>Retired <strong>28</strong></li></ul></div><div className="admin-card quick"><h3>Quick actions</h3><button><QrCode/> Generate label batch</button><button><LifeBuoy/> Review reported entries</button><button onClick={()=>navigate("/duck/DP-0427")}><Search/> View public journey</button></div></aside>
      </section>
      <section className="static-notice"><Sparkles/><div><strong>This is a working static admin demo.</strong><span>Approvals update in this browser session. Roles, authentication, persistence, exports, and moderation rules will connect when the backend is added.</span></div></section>
    </main><Footer /></>
  );
}

function NotFound() {
  return <main className="not-found"><div><Compass size={46}/><h1>That duck wandered off.</h1><p>The page you're looking for isn't on this sailing.</p><button className="primary" onClick={()=>navigate("/")}>Return to Waddle Aboard</button></div></main>;
}

export function App() {
  const [route, setRoute] = useState(window.location.pathname);
  useEffect(() => { const update = () => setRoute(window.location.pathname); window.addEventListener("popstate", update); return () => window.removeEventListener("popstate", update); }, []);
  const page = useMemo(() => {
    if (route === "/") return <HomePage />;
    if (route === "/duck/DP-0427") return <DuckPage />;
    if (route === "/my-flock") return <FlockPage />;
    if (route === "/how-it-works") return <HowPage />;
    if (route === "/admin") return <AdminPage />;
    return <NotFound />;
  }, [route]);
  return <div className="app"><Header route={route} />{page}</div>;
}
