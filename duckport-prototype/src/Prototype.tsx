import { FormEvent, useMemo, useState } from "react";
import "@fontsource/fredoka/latin-500.css";
import "@fontsource/fredoka/latin-600.css";
import "@fontsource/fredoka/latin-700.css";
import "@fontsource/nunito/latin-400.css";
import "@fontsource/nunito/latin-600.css";
import "@fontsource/nunito/latin-700.css";
import "@fontsource/nunito/latin-800.css";
import {
  ArchiveIcon,
  CheckCircledIcon,
  ChevronRightIcon,
  DashboardIcon,
  GlobeIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SewingPinFilledIcon,
} from "@radix-ui/react-icons";
import { BottomSheet, KeyboardInput, KeyboardTextarea, MobileScroll, useKeyboard } from "./mobile";

type Tab = "duck" | "flock" | "admin";

type JourneyEntry = {
  id: number;
  date: string;
  location: string;
  note: string;
  finder: string;
  image?: string;
};

const initialJourney: JourneyEntry[] = [
  {
    id: 1,
    date: "Oct 14, 2026",
    location: "Cozumel, Mexico",
    note: "Found near the pool deck! We’re taking Sunny to the next port.",
    finder: "The Martinez family",
    image: "/assets/duckport/cozumel.png",
  },
  {
    id: 2,
    date: "Oct 10, 2026",
    location: "Galveston, Texas",
    note: "The journey begins",
    finder: "DuckPort HQ",
    image: "/assets/duckport/galveston.png",
  },
];

const flock = [
  { name: "Sunny", id: "DP-0427", place: "Cozumel, Mexico", status: "Sailing", image: "/assets/duckport/sunny-hero.png", distance: "1,284 mi" },
  { name: "Coral", id: "DP-0184", place: "Nassau, Bahamas", status: "Found today", image: "/assets/duckport/coral-portrait.png", distance: "642 mi" },
  { name: "Minty", id: "DP-0312", place: "St. Thomas, USVI", status: "2 days ago", image: "/assets/duckport/minty-portrait.png", distance: "1,908 mi" },
  { name: "Blue", id: "DP-0098", place: "Miami, Florida", status: "Waiting to hide", image: "/assets/duckport/blue-portrait.png", distance: "0 mi" },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand brand--compact" : "brand"} aria-label="DuckPort">
      <span>DuckPort</span>
      {!compact ? <small>Small ducks. Big adventures.</small> : null}
    </div>
  );
}

function DuckScreen({ onAdd, journey }: { onAdd: () => void; journey: JourneyEntry[] }) {
  return (
    <div className="duck-screen">
      <header className="topbar">
        <Brand />
        <button className="round-button" aria-label="Search DuckPort">
          <MagnifyingGlassIcon />
        </button>
      </header>

      <section className="hero" aria-labelledby="sunny-title">
        <div className="hero-photo-wrap">
          <img className="hero-photo" src="/assets/duckport/sunny-hero.png" alt="Sunny, a yellow 3D-printed duck in a captain hat, overlooking the ocean" />
          <span className="hero-stamp">Good ducks<br />travel far</span>
        </div>
        <p className="eyebrow">Duck #DP-0427</p>
        <h1 id="sunny-title">You found Sunny!</h1>
        <button className="primary-button" onClick={onAdd}>
          <SewingPinFilledIcon /> Add your find
        </button>
        <p className="button-caption">Leave the next pin on the map</p>
        <div className="travel-summary">
          <GlobeIcon />
          <strong>Sunny has traveled 1,284 miles with {journey.length + 4} finders.</strong>
        </div>
      </section>

      <section className="journey-section" aria-labelledby="journey-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The guest book</p>
            <h2 id="journey-title">Sunny’s journey</h2>
          </div>
          <span className="count-pill">{journey.length} stops</span>
        </div>
        <div className="timeline">
          {journey.map((entry, index) => (
            <article className="timeline-entry" key={entry.id}>
              <span className={index === 0 ? "timeline-dot timeline-dot--latest" : "timeline-dot"} aria-hidden="true" />
              <p className="entry-meta"><strong>{entry.date}</strong> · <span>{entry.location}</span></p>
              {entry.image ? <img src={entry.image} alt={`Travel view from ${entry.location}`} /> : null}
              <blockquote>{entry.note}</blockquote>
              <p className="finder">— {entry.finder}</p>
            </article>
          ))}
        </div>
        <button className="text-link">The duck-hiding tradition <ChevronRightIcon /></button>
      </section>
    </div>
  );
}

function FlockScreen() {
  const [filter, setFilter] = useState<"all" | "traveling" | "home">("all");
  const visibleFlock = useMemo(() => {
    if (filter === "traveling") return flock.filter((duck) => duck.status !== "Waiting to hide");
    if (filter === "home") return flock.filter((duck) => duck.status === "Waiting to hide");
    return flock;
  }, [filter]);

  return (
    <div className="flock-screen">
      <header className="screen-header">
        <Brand compact />
        <span className="mode-label">Collector view</span>
      </header>
      <section className="flock-hero">
        <img src="/assets/duckport/my-flock.png" alt="Four colorful 3D-printed cruise ducks gathered by a porthole" />
        <div className="flock-title-row">
          <div>
            <p className="eyebrow">Your collection</p>
            <h1>My Flock</h1>
          </div>
          <div className="flock-total"><strong>4</strong><span>ducks</span></div>
        </div>
        <p>Keep up with every duck you’ve hidden or collected—and see where the current has carried them.</p>
      </section>

      <div className="segmented" aria-label="Filter flock">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button>
        <button className={filter === "traveling" ? "active" : ""} onClick={() => setFilter("traveling")}>Traveling</button>
        <button className={filter === "home" ? "active" : ""} onClick={() => setFilter("home")}>At home</button>
      </div>

      <section className="flock-grid" aria-label="Collected ducks">
        {visibleFlock.map((duck) => (
          <button className="flock-card" key={duck.id}>
            <img src={duck.image} alt={`${duck.name}, a collected 3D-printed duck`} />
            <span className="flock-card-copy">
              <span className="flock-card-title"><strong>{duck.name}</strong><small>{duck.id}</small></span>
              <span className="flock-location"><SewingPinFilledIcon /> {duck.place}</span>
              <span className="flock-card-foot"><em>{duck.status}</em><b>{duck.distance}</b></span>
            </span>
            <ChevronRightIcon className="flock-chevron" />
          </button>
        ))}
      </section>

      <button className="secondary-button"><PlusIcon /> Register a new duck</button>
    </div>
  );
}

function AdminScreen() {
  const [approved, setApproved] = useState<number[]>([]);
  const queue = [
    { id: 1, duck: "Sunny", finder: "Martinez family", place: "Cozumel", age: "12 min" },
    { id: 2, duck: "Coral", finder: "Jamie R.", place: "Nassau", age: "1 hr" },
  ];

  return (
    <div className="admin-screen">
      <header className="screen-header">
        <Brand compact />
        <span className="mode-label mode-label--admin">Admin</span>
      </header>
      <section className="admin-intro">
        <div>
          <p className="eyebrow">DuckPort HQ</p>
          <h1>Good morning, Captain</h1>
          <p>Three new stories are waiting to join the flock.</p>
        </div>
        <img src="/assets/duckport/my-flock.png" alt="The DuckPort flock gathered by a cruise ship porthole" />
      </section>

      <section className="admin-stats" aria-label="Admin summary">
        <article><span><GlobeIcon /> Live fleet</span><strong>128</strong><small>active ducks</small></article>
        <article><span><SewingPinFilledIcon /> This week</span><strong>42</strong><small>new finds</small></article>
        <article className="attention"><span><ArchiveIcon /> Review</span><strong>3</strong><small>need approval</small></article>
      </section>

      <section className="admin-panel">
        <div className="section-heading">
          <div><p className="eyebrow">Moderation</p><h2>Recent finds</h2></div>
          <button className="mini-link">View all</button>
        </div>
        {queue.map((item) => {
          const isApproved = approved.includes(item.id);
          return (
            <article className="review-row" key={item.id}>
              <span className="review-thumb"><img src={item.duck === "Sunny" ? "/assets/duckport/sunny-hero.png" : "/assets/duckport/coral-portrait.png"} alt="" /></span>
              <div>
                <strong>{item.duck} · {item.place}</strong>
                <small>{item.finder} · {item.age} ago</small>
              </div>
              <button
                className={isApproved ? "approve-button approved" : "approve-button"}
                onClick={() => setApproved((current) => current.includes(item.id) ? current : [...current, item.id])}
              >
                <CheckCircledIcon /> {isApproved ? "Approved" : "Approve"}
              </button>
            </article>
          );
        })}
      </section>

      <section className="admin-panel">
        <div className="section-heading">
          <div><p className="eyebrow">Inventory</p><h2>Duck registry</h2></div>
          <button className="round-button round-button--small" aria-label="Add duck"><PlusIcon /></button>
        </div>
        {flock.slice(0, 3).map((duck) => (
          <button className="registry-row" key={duck.id}>
            <img src={duck.image} alt="" />
            <span><strong>{duck.name}</strong><small>{duck.id} · {duck.place}</small></span>
            <ChevronRightIcon />
          </button>
        ))}
      </section>
    </div>
  );
}

function AddFindSheet({
  open,
  onOpenChange,
  onSubmit,
  onFieldFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (entry: JourneyEntry) => void;
  onFieldFocus: () => void;
}) {
  const [location, setLocation] = useState("Costa Maya, Mexico");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      id: Date.now(),
      date: "Oct 17, 2026",
      location: location || "At sea",
      note: note || "Sunny was found and is ready for the next adventure.",
      finder: name || "A fellow traveler",
    });
    onOpenChange(false);
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Add Sunny’s next stop" description="A quick note becomes part of Sunny’s guest book forever." snap={0.94}>
      <form className="find-form" onSubmit={submit}>
        <div className="find-context">
          <img src="/assets/duckport/sunny-hero.png" alt="Sunny" />
          <p><strong>Sunny · DP-0427</strong><span>6 finders · 1,284 miles</span></p>
        </div>
        <label>
          <span>Where did you find Sunny?</span>
          <KeyboardInput value={location} onFocus={onFieldFocus} onChange={(event) => setLocation(event.target.value)} placeholder="City, port, or ship" required />
        </label>
        <label>
          <span>Your name or crew name</span>
          <KeyboardInput value={name} onFocus={onFieldFocus} onChange={(event) => setName(event.target.value)} placeholder="The Rivera family" />
        </label>
        <label>
          <span>Leave a note</span>
          <KeyboardTextarea value={note} onFocus={onFieldFocus} onChange={(event) => setNote(event.target.value)} placeholder="Where was Sunny hiding? Where will Sunny go next?" rows={3} />
        </label>
        <label className="photo-button">
          <span><PlusIcon /> Add a photo</span>
          <input type="file" accept="image/*" />
        </label>
        <button className="primary-button" type="submit">Add to the guest book</button>
      </form>
    </BottomSheet>
  );
}

export default function Prototype() {
  const keyboard = useKeyboard();
  const [tab, setTab] = useState<Tab>("duck");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [journey, setJourney] = useState(initialJourney);
  const [toast, setToast] = useState(false);

  const addEntry = (entry: JourneyEntry) => {
    setJourney((current) => [entry, ...current]);
    setToast(true);
    window.setTimeout(() => setToast(false), 2400);
  };

  const resetDeviceCanvas = () => {
    const reset = () => {
      const screen = document.querySelector<HTMLElement>('[data-testid="device-screen"]');
      if (screen) screen.scrollTop = 0;
    };

    reset();
    window.requestAnimationFrame(() => {
      reset();
      window.requestAnimationFrame(reset);
    });
    window.setTimeout(reset, 160);
  };

  const changeTab = (nextTab: Tab) => {
    keyboard.hide();
    setTab(nextTab);
    resetDeviceCanvas();
  };

  const changeSheet = (nextOpen: boolean) => {
    if (!nextOpen) keyboard.hide();
    setSheetOpen(nextOpen);
    resetDeviceCanvas();
  };

  return (
    <div className="prototype-shell">
      <MobileScroll key={tab} className="app-screen duckport-scroll">
        <main className="screen-content" data-testid="duckport-screen">
          {tab === "duck" ? <DuckScreen onAdd={() => changeSheet(true)} journey={journey} /> : null}
          {tab === "flock" ? <FlockScreen /> : null}
          {tab === "admin" ? <AdminScreen /> : null}
        </main>
      </MobileScroll>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <button className={tab === "duck" ? "active" : ""} onClick={() => changeTab("duck")}><HomeIcon /><span>Duck</span></button>
        <button className={tab === "flock" ? "active" : ""} onClick={() => changeTab("flock")}><GlobeIcon /><span>My Flock</span></button>
        <button className={tab === "admin" ? "active" : ""} onClick={() => changeTab("admin")}><DashboardIcon /><span>Admin</span></button>
      </nav>

      <AddFindSheet open={sheetOpen} onOpenChange={changeSheet} onSubmit={addEntry} onFieldFocus={resetDeviceCanvas} />
      {toast ? <div className="toast" role="status"><CheckCircledIcon /> Sunny’s map has a new pin!</div> : null}
    </div>
  );
}
