import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";

const API_URL = "https://tinyurl-backend-production-4561.up.railway.app"; // Railway ka asal, confirmed domain

async function startCheckout(billingCycle) {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.hash = "#/login";
    return;
  }
  try {
    const res = await fetchWithRetry(`${API_URL}/api/stripe/create-checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ billingCycle }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url; // Stripe Checkout page pe redirect
    }
  } catch (err) {
    alert("Could not start checkout. Please try again.");
  }
}

async function openBillingPortal() {
  const token = localStorage.getItem("token");
  const res = await fetchWithRetry(`${API_URL}/api/stripe/create-portal-session`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.url) window.location.href = data.url;
}

// subscription status backend se fetch karta hai
async function fetchSubscriptionStatus(token) {
  if (!token) return null;
  try {
    const res = await fetchWithRetry(`${API_URL}/api/stripe/subscription-status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data;
  } catch (err) {
    return null;
  }
}

// Helper: fetch with automatic retry (server "waking up" wala case handle karta hai)
async function fetchWithRetry(url, options = {}, retries = 2, delay = 2000) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

function App() {
  const [page, setPage] = useState("home");
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("user") || "null"));
  const [subscription, setSubscription] = useState(null); // { plan, status, cancelAtPeriodEnd, ... }

  // token change hote hi (login/logout) subscription status refresh karo
  const refreshSubscription = async () => {
    if (!token) {
      setSubscription(null);
      return;
    }
    const data = await fetchSubscriptionStatus(token);
    setSubscription(data);
  };

  useEffect(() => {
    refreshSubscription();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Stripe Checkout se wapas aane par (success/canceled) URL params handle karo
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      alert("Payment successful! Your subscription will update in a few seconds.");
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(refreshSubscription, 3000); // thori dair baad dobara fetch, webhook process hone ka time dene ke liye
    } else if (params.get("checkout") === "canceled") {
      alert("Checkout was canceled.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoginSuccess = (data) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setPage("dashboard");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken("");
    setUser(null);
    setSubscription(null);
    setPage("home");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex flex-col">
      <Navbar page={page} setPage={setPage} token={token} user={user} />

      <div className="px-4 py-6 flex-1">
        <div key={page} className="page-transition w-full max-w-5xl mx-auto">
          {page === "home" && <HomePage setPage={setPage} token={token} />}
          {page === "login" && <LoginPage onSuccess={handleLoginSuccess} goToSignup={() => setPage("signup")} />}
          {page === "signup" && <SignupPage onSuccess={handleLoginSuccess} goToLogin={() => setPage("login")} />}
          {page === "dashboard" && <Dashboard token={token} user={user} subscription={subscription} />}
          {page === "analytics" && <AnalyticsPage token={token} />}
          {page === "blog" && <BlogPage />}
          {page === "profile" && (
            <ProfilePage user={user} onLogout={handleLogout} subscription={subscription} />
          )}
        </div>
      </div>

      <Footer />
      <ChatWidget />
    </div>
  );
}

// ================= NAVBAR =================
function Navbar({ page, setPage, token, user }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const NavButton = ({ target, label }) => (
    <button
      onClick={() => {
        setPage(target);
        setMenuOpen(false);
      }}
      className={`text-sm font-bold transition-colors duration-200 text-left ${
        page === target ? "text-violet-300" : "text-slate-300 hover:text-violet-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <nav className="border-b border-white/10 bg-slate-950/70 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-4">
        <button onClick={() => setPage("home")} className="flex items-center gap-2 group">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-lg font-black text-white shadow-lg shadow-violet-500/30 group-hover:rotate-6 transition-transform duration-300">
            T
          </span>
          <span className="font-display text-xl font-extrabold bg-gradient-to-r from-violet-300 via-fuchsia-300 to-pink-300 bg-clip-text text-transparent">
            TinyURL
          </span>
        </button>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-6">
          <NavButton target="home" label="Home" />
          <NavButton target="blog" label="Blog" />
          {token && <NavButton target="dashboard" label="Dashboard" />}
          {token && <NavButton target="analytics" label="Analytics" />}
        </div>

        <div className="hidden sm:flex items-center gap-3">
          {token ? (
            <button
              onClick={() => setPage("profile")}
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition"
            >
              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-600 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-violet-500/30">
                {user?.name?.[0]?.toUpperCase() || "U"}
              </span>
              <span className="font-semibold">{user?.name}</span>
            </button>
          ) : (
            <>
              <button onClick={() => setPage("login")} className="px-4 py-1.5 text-sm font-bold rounded-lg text-slate-300 hover:text-white hover:bg-white/5 transition">
                Login
              </button>
              <button onClick={() => setPage("signup")} className="px-4 py-1.5 text-sm font-bold rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 hover:scale-105 transition-all duration-200">
                Sign Up
              </button>
            </>
          )}
        </div>

        {/* Hamburger button (mobile) */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="sm:hidden flex flex-col gap-1.5 p-2"
        >
          <span className={`block w-6 h-0.5 bg-white rounded transition-all ${menuOpen ? "rotate-45 translate-y-2" : ""}`} />
          <span className={`block w-6 h-0.5 bg-white rounded transition-all ${menuOpen ? "opacity-0" : ""}`} />
          <span className={`block w-6 h-0.5 bg-white rounded transition-all ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="sm:hidden flex flex-col gap-4 px-6 pb-5 pt-2 border-t border-white/10 bg-slate-950/95">
          <NavButton target="home" label="Home" />
          <NavButton target="blog" label="Blog" />
          {token && <NavButton target="dashboard" label="Dashboard" />}
          {token && <NavButton target="analytics" label="Analytics" />}
          {token ? (
            <button
              onClick={() => { setPage("profile"); setMenuOpen(false); }}
              className="flex items-center gap-2 text-sm text-slate-300"
            >
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-600 flex items-center justify-center text-white text-xs font-bold">
                {user?.name?.[0]?.toUpperCase() || "U"}
              </span>
              <span className="font-semibold">{user?.name}</span>
            </button>
          ) : (
            <div className="flex gap-3">
              <button onClick={() => { setPage("login"); setMenuOpen(false); }} className="flex-1 px-4 py-2 text-sm font-bold rounded-lg text-slate-300 border border-white/10">
                Login
              </button>
              <button onClick={() => { setPage("signup"); setMenuOpen(false); }} className="flex-1 px-4 py-2 text-sm font-bold rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white">
                Sign Up
              </button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

// ================= HOME PAGE =================
function HomePage({ setPage, token }) {
  const [longUrl, setLongUrl] = useState("");
  const [shortUrl, setShortUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [billingCycle, setBillingCycle] = useState("monthly"); // Pro plan monthly/yearly toggle
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const quickShorten = async () => {
    setError("");
    setShortUrl("");
    if (!longUrl.trim()) {
      setError("Please enter a URL");
      return;
    }
    setLoading(true);
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetchWithRetry(`${API_URL}/save`, {
        method: "POST",
        headers,
        body: JSON.stringify({ longUrl }),
      });
      const data = await res.json();
      if (data.ok) {
        setShortUrl(data.shortURL);
        setLongUrl("");
      } else {
        setError(data.message || "Something went wrong");
      }
    } catch (err) {
      setError("Server is waking up — please try again in a few seconds");
    } finally {
      setLoading(false);
    }
  };

  // "Upgrade to Pro" click handle karta hai home page ke Plans section mein
  const handleUpgradeClick = async () => {
    if (checkoutLoading) return;
    setCheckoutLoading(true);
    await startCheckout(billingCycle);
    setCheckoutLoading(false);
  };

  return (
    <div className="flex flex-col gap-20">
      {/* HERO */}
      <div className="grid sm:grid-cols-2 gap-10 items-center">
        <div>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30 mb-5 floaty">
            <span className="text-3xl">🔗</span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-white leading-tight mb-4">
            Shorten Links.{" "}
            <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-pink-300 bg-clip-text text-transparent">
              Track Clicks.
            </span>{" "}
            Grow Smarter.
          </h1>
          <p className="text-slate-400 text-lg mb-8 leading-relaxed">
            Turn long, messy links into short, branded, trackable URLs — in one click.
          </p>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={longUrl}
                onChange={(e) => setLongUrl(e.target.value)}
                placeholder="https://example.com/long-url"
                className="flex-1 px-4 py-3 rounded-xl bg-slate-900/80 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
              />
              <button
                onClick={quickShorten}
                disabled={loading}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-400 hover:to-fuchsia-400 disabled:opacity-50 text-white font-bold shadow-lg hover:shadow-violet-500/40 hover:scale-105 transition-all duration-200"
              >
                {loading ? "..." : "⚡ Shorten"}
              </button>
            </div>

            {error && <p className="text-amber-400 text-sm mt-3">⏳ {error}</p>}

            {shortUrl && (
              <div className="mt-4 bg-slate-900/80 border border-violet-500/30 rounded-xl p-4 flex items-center justify-between gap-2">
                <a href={shortUrl} target="_blank" rel="noreferrer" className="text-violet-300 font-semibold truncate hover:underline">
                  {shortUrl}
                </a>
                <button
                  onClick={() => navigator.clipboard.writeText(shortUrl)}
                  className="shrink-0 px-3 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-violet-600 text-white transition"
                >
                  Copy
                </button>
              </div>
            )}

            {!token && (
              <p className="text-slate-500 text-xs mt-3">
                💡 Log in to see all your links in one place and track analytics.
              </p>
            )}
          </div>
        </div>

        <div className="hidden sm:block">
          <img
            src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=80"
            alt="Analytics dashboard"
            className="rounded-3xl shadow-2xl border border-white/10 floaty"
          />
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div>
        <h2 className="font-display text-3xl font-extrabold text-white text-center mb-2">How It Works</h2>
        <p className="text-slate-400 text-center mb-10">Three simple steps to a shorter, smarter link.</p>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { icon: "🔗", title: "1. Paste Your Link", desc: "Paste your long URL, add a custom name if you like." },
            { icon: "⚡", title: "2. Instant Shorten", desc: "Get a short, professional link in one click." },
            { icon: "📊", title: "3. Track Performance", desc: "See how many times your link is clicked, and when." },
          ].map((step, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center hover:border-violet-500/50 hover:-translate-y-1 transition-all duration-300">
              <div className="text-4xl mb-3">{step.icon}</div>
              <h3 className="text-white font-bold text-lg mb-2">{step.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* BENEFITS */}
      <div>
        <h2 className="font-display text-3xl font-extrabold text-white text-center mb-2">Benefits</h2>
        <p className="text-slate-400 text-center mb-10">Everything you need to manage links like a pro.</p>
        <div className="grid sm:grid-cols-2 gap-6">
          {[
            { icon: "🎯", title: "Custom Aliases", desc: "Give your links meaningful names — a professional, branded look.", color: "from-violet-500 to-purple-600" },
            { icon: "📈", title: "Click Analytics", desc: "Track your link's performance with visual charts.", color: "from-blue-500 to-cyan-500" },
            { icon: "🔒", title: "Secure Accounts", desc: "Log in to keep all your links safe and organized.", color: "from-fuchsia-500 to-pink-600" },
            { icon: "📱", title: "QR Codes", desc: "Instantly generate a QR code for every short link.", color: "from-orange-400 to-amber-500" },
          ].map((b, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 flex gap-4 hover:border-white/20 hover:scale-[1.02] transition-all duration-300">
              <div className={`w-14 h-14 shrink-0 rounded-xl bg-gradient-to-br ${b.color} flex items-center justify-center text-2xl shadow-lg`}>
                {b.icon}
              </div>
              <div>
                <h3 className="text-white font-bold text-lg mb-1">{b.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PLANS — monthly/yearly toggle + real Stripe checkout */}
      <div>
        <h2 className="font-display text-3xl font-extrabold text-white text-center mb-2">Plans</h2>
        <p className="text-slate-400 text-center mb-6">Start free. Upgrade when you're ready to scale.</p>

        <div className="flex gap-2 justify-center mb-8">
          <button
            onClick={() => setBillingCycle("monthly")}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition ${
              billingCycle === "monthly"
                ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white"
                : "bg-white/5 text-slate-400 border border-white/10"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle("yearly")}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition ${
              billingCycle === "yearly"
                ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white"
                : "bg-white/5 text-slate-400 border border-white/10"
            }`}
          >
            Yearly <span className="opacity-75">(save more)</span>
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <h3 className="text-white font-bold text-xl mb-1">Free</h3>
            <p className="text-slate-400 text-sm mb-4">Perfect for getting started</p>
            <p className="text-4xl font-extrabold text-white mb-6">$0</p>
            <ul className="text-slate-300 text-sm flex flex-col gap-2">
              <li>✓ Unlimited link shortening</li>
              <li>✓ Custom aliases</li>
              <li>✓ Click analytics</li>
              <li>✓ QR code generation</li>
            </ul>
          </div>
          <div className="bg-gradient-to-br from-violet-900/40 to-fuchsia-900/30 border border-violet-500/30 rounded-2xl p-8 relative">
            <h3 className="text-white font-bold text-xl mb-1">Pro</h3>
            <p className="text-slate-400 text-sm mb-4">For growing teams &amp; brands</p>
            <p className="text-4xl font-extrabold text-white mb-6">
              {billingCycle === "monthly" ? "$5" : "$48"}
              <span className="text-base font-normal text-slate-400">/{billingCycle === "monthly" ? "mo" : "yr"}</span>
            </p>
            <ul className="text-slate-300 text-sm flex flex-col gap-2 mb-6">
              <li>✓ Everything in Free</li>
              <li>✓ Bulk link shortening</li>
              <li>✓ Advanced link management</li>
              <li>✓ Priority support</li>
            </ul>
            <button
              onClick={handleUpgradeClick}
              disabled={checkoutLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-400 hover:to-fuchsia-400 disabled:opacity-50 text-white font-bold shadow-lg hover:scale-[1.02] transition-all duration-200"
            >
              {checkoutLoading ? "Redirecting..." : "Upgrade to Pro"}
            </button>
          </div>
        </div>
      </div>

      {/* FEATURES */}
      <div>
        <h2 className="font-display text-3xl font-extrabold text-white text-center mb-2">Features</h2>
        <p className="text-slate-400 text-center mb-10">Built for real link management, not just shortening.</p>
        <div className="grid sm:grid-cols-3 gap-5">
          {["Link Editor", "Link Management", "Custom Aliases", "Click Tracking", "QR Code Generator", "Bulk Short URLs"].map((f, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-5 text-center hover:border-violet-500/40 transition">
              <p className="text-white font-semibold">{f}</p>
            </div>
          ))}
        </div>
      </div>

      {/* RESOURCES / DOMAINS */}
      <div className="grid sm:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <h3 className="text-white font-bold text-xl mb-3">Resources</h3>
          <ul className="text-slate-400 text-sm flex flex-col gap-2">
            <li>📘 Getting Started Guide</li>
            <li>🛠️ Developer Docs</li>
            <li>❓ FAQs &amp; Support</li>
          </ul>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <h3 className="text-white font-bold text-xl mb-3">Domains</h3>
          <p className="text-slate-400 text-sm mb-3">Your links are currently served from:</p>
          <p className="text-violet-300 font-mono text-sm bg-slate-900/60 rounded-lg px-3 py-2 inline-block">
            tiny-url-clone-production.up.railway.app
          </p>
        </div>
      </div>

      {/* CTA */}
      {!token && (
        <div className="text-center bg-gradient-to-br from-violet-900/40 to-fuchsia-900/30 border border-violet-500/20 rounded-3xl p-12">
          <h2 className="font-display text-3xl font-extrabold text-white mb-3">Get Started Today</h2>
          <p className="text-slate-400 mb-6 text-lg">Create a free account and manage your links professionally.</p>
          <button
            onClick={() => setPage("signup")}
            className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-400 hover:to-fuchsia-400 text-white font-bold text-lg shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-105 transition-all duration-200"
          >
            Create Free Account
          </button>
        </div>
      )}
    </div>
  );
}

// ================= BLOG PAGE =================
function BlogPage() {
  const posts = [
    { title: "What Is a URL Shortener and Why You Need One", date: "September 2026", excerpt: "Long URLs are a pain on social media, messages, and marketing. Here's how a shortener helps.", img: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&q=80" },
    { title: "Making the Most of Custom Aliases", date: "September 2026", excerpt: "Why branded links look more professional, and how they build trust.", img: "https://images.unsplash.com/photo-1432888622747-4eb9a8efeb07?w=500&q=80" },
    { title: "Using Click Analytics to Make Better Decisions", date: "September 2026", excerpt: "How understanding your click data can sharpen your marketing strategy.", img: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=500&q=80" },
    { title: "QR Codes: The Bridge Between Print and Digital", date: "September 2026", excerpt: "How QR codes on flyers, packaging, and posters connect straight to your shortened links.", img: "https://images.unsplash.com/photo-1595079676339-1534801ad6cf?w=500&q=80" },
    { title: "5 Ways Small Businesses Use Short Links", date: "September 2026", excerpt: "From promotions to receipts, here's how small businesses put short URLs to work.", img: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=500&q=80" },
  ];

  return (
    <div>
      <h1 className="font-display text-4xl font-extrabold text-white mb-2">Blog</h1>
      <p className="text-slate-400 mb-10 text-lg">Thoughts on link shortening, management, and analytics.</p>
      <div className="grid sm:grid-cols-2 gap-6">
        {posts.map((post, i) => (
          <div key={i} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-violet-500/50 hover:-translate-y-1 transition-all duration-300">
            <img src={post.img} alt={post.title} className="w-full h-40 object-cover" />
            <div className="p-6">
              <p className="text-violet-300 text-xs font-bold mb-2 uppercase tracking-wide">{post.date}</p>
              <h2 className="text-white font-bold text-lg mb-2">{post.title}</h2>
              <p className="text-slate-400 text-sm leading-relaxed">{post.excerpt}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================= PROFILE PAGE =================
function ProfilePage({ user, onLogout, subscription }) {
  const isPro = subscription?.plan === "pro";

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-8 text-center">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-600 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 shadow-lg shadow-violet-500/30">
          {user?.name?.[0]?.toUpperCase() || "U"}
        </div>
        <h1 className="text-2xl font-extrabold text-white mb-1">{user?.name}</h1>
        <p className="text-slate-400 mb-6">{user?.email}</p>

        <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 mb-6 text-left">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Current Plan</p>
          <p className="text-white font-bold text-lg mb-2">
            {isPro ? "Pro ✨" : "Free"}
          </p>
          {isPro && (
            <>
              <p className="text-slate-400 text-xs">
                Status: <span className="text-violet-300 font-semibold">{subscription.status}</span>
                {subscription.cancelAtPeriodEnd && " (cancels at period end)"}
              </p>
              <button
                onClick={openBillingPortal}
                className="mt-3 w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-400 hover:to-fuchsia-400 text-white font-bold text-sm shadow-lg transition-all duration-200"
              >
                Manage Subscription
              </button>
            </>
          )}
        </div>

        <button onClick={onLogout} className="w-full py-3 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white font-bold transition-all duration-200">
          Logout
        </button>
      </div>
    </div>
  );
}

// ================= LOGIN PAGE =================
function LoginPage({ onSuccess, goToSignup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // password dikhane/chupane ka toggle
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError("");
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetchWithRetry(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.ok) {
        onSuccess(data);
      } else {
        setError(data.message || "Login failed");
      }
    } catch (err) {
      setError("Server is waking up — please try again in a few seconds");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-8">
      <h1 className="font-display text-3xl font-extrabold text-center bg-gradient-to-r from-violet-300 via-fuchsia-300 to-pink-300 bg-clip-text text-transparent mb-6">
        Login
      </h1>
      <div className="flex flex-col gap-3">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full px-4 py-3.5 rounded-xl bg-slate-900/80 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition" />
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-4 py-3.5 pr-12 rounded-xl bg-slate-900/80 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
          />
          {/* password show/hide icon */}
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition text-lg"
            tabIndex={-1}
          >
            {showPassword ? "🙈" : "👁️"}
          </button>
        </div>
        <button onClick={handleLogin} disabled={loading} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-400 hover:to-fuchsia-400 disabled:opacity-50 text-white font-bold shadow-lg hover:scale-[1.02] transition-all duration-200">
          {loading ? "Logging in..." : "Login"}
        </button>
      </div>
      {error && <p className="text-amber-400 text-sm mt-4 text-center bg-amber-500/10 border border-amber-500/20 rounded-lg py-2 px-3">⏳ {error}</p>}
      <p className="text-slate-400 text-center mt-6 text-sm">
        Don't have an account?{" "}
        <button onClick={goToSignup} className="text-violet-300 font-bold hover:underline">Sign up</button>
      </p>
    </div>
  );
}

// ================= SIGNUP PAGE =================
function SignupPage({ onSuccess, goToLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // password dikhane/chupane ka toggle
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    setError("");
    if (!name || !email || !password) {
      setError("All fields are required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetchWithRetry(`${API_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (data.ok) {
        onSuccess(data);
      } else {
        setError(data.message || "Signup failed");
      }
    } catch (err) {
      setError("Server is waking up — please try again in a few seconds");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-8">
      <h1 className="font-display text-3xl font-extrabold text-center bg-gradient-to-r from-violet-300 via-fuchsia-300 to-pink-300 bg-clip-text text-transparent mb-6">
        Sign Up
      </h1>
      <div className="flex flex-col gap-3">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name" className="w-full px-4 py-3.5 rounded-xl bg-slate-900/80 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full px-4 py-3.5 rounded-xl bg-slate-900/80 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition" />
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-4 py-3.5 pr-12 rounded-xl bg-slate-900/80 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
          />
          {/* password show/hide icon */}
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition text-lg"
            tabIndex={-1}
          >
            {showPassword ? "🙈" : "👁️"}
          </button>
        </div>
        <button onClick={handleSignup} disabled={loading} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-400 hover:to-fuchsia-400 disabled:opacity-50 text-white font-bold shadow-lg hover:scale-[1.02] transition-all duration-200">
          {loading ? "Creating..." : "Sign Up"}
        </button>
      </div>
      {error && <p className="text-amber-400 text-sm mt-4 text-center bg-amber-500/10 border border-amber-500/20 rounded-lg py-2 px-3">⏳ {error}</p>}
      <p className="text-slate-400 text-center mt-6 text-sm">
        Already have an account?{" "}
        <button onClick={goToLogin} className="text-violet-300 font-bold hover:underline">Log in</button>
      </p>
    </div>
  );
}

// colorful stat cards row (Baligo-style reference se inspired, apni violet/fuchsia theme mein)
function StatsRow({ totalLinks, totalClicks, plan }) {
  const cards = [
    { label: "Total Links", value: totalLinks, gradient: "from-violet-600 to-purple-500", icon: "🔗" },
    { label: "Total Clicks", value: totalClicks, gradient: "from-fuchsia-600 to-pink-500", icon: "📊" },
    { label: "Plan", value: plan === "pro" ? "Pro ✨" : "Free", gradient: "from-blue-600 to-cyan-500", icon: "⭐" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      {cards.map((c) => (
        <div key={c.label} className={`bg-gradient-to-br ${c.gradient} rounded-2xl p-5 text-white shadow-lg`}>
          <p className="text-sm opacity-90">{c.label}</p>
          <p className="font-bold mt-1 text-2xl">{c.icon} {c.value}</p>
        </div>
      ))}
    </div>
  );
}

// khoobsurat circular gauge — center mein bara percentage number (reference screenshot se inspired)
function RadialGauge({ label, value, color = "#8b5cf6", trackColor = "#1e293b", size = 140 }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const data = [
    { name: "value", value: pct },
    { name: "rest", value: 100 - pct },
  ];
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              innerRadius="72%"
              outerRadius="100%"
              cornerRadius={20}
              stroke="none"
            >
              <Cell fill={color} />
              <Cell fill={trackColor} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* chart ke upar overlay — center ka bara number */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-white font-extrabold text-2xl">{pct}%</span>
        </div>
      </div>
      <p className="text-slate-400 text-xs mt-2 text-center">{label}</p>
    </div>
  );
}

// chota colored-dot legend row — gauge ke sath side mein numbers dikhane ke liye
function LegendRow({ color, label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-slate-300 text-sm">{label}</span>
      <span className="text-white font-bold text-sm ml-auto">{value}</span>
    </div>
  );
}

// Dashboard ka "Overview" panel — gauge + legend dono ek sath (purani ClicksDonut ki jagah)
function OverviewPanel({ totalLinks, totalClicks }) {
  // "engagement" score — kitne links per average click mil rahay hain, ek rough gauge ke taur par
  const engagementPct = totalLinks > 0 ? Math.min(100, Math.round((totalClicks / totalLinks) * 20)) : 0;

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6 flex items-center gap-8 flex-wrap">
      <RadialGauge label="Engagement" value={engagementPct} color="#a78bfa" size={130} />
      <div className="flex flex-col gap-3 flex-1 min-w-[160px]">
        <p className="text-white font-bold mb-1">Overview</p>
        <LegendRow color="#8b5cf6" label="Total Links" value={totalLinks} />
        <LegendRow color="#d946ef" label="Total Clicks" value={totalClicks} />
      </div>
    </div>
  );
}

// ================= DASHBOARD =================
function Dashboard({ token, user, subscription }) {
  const [longUrl, setLongUrl] = useState("");
  const [customAlias, setCustomAlias] = useState("");
  const [shortUrl, setShortUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [myUrls, setMyUrls] = useState([]);
  const [analyticsFor, setAnalyticsFor] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);

  const fetchMyUrls = async () => {
    try {
      const res = await fetchWithRetry(`${API_URL}/api/my-urls`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) setMyUrls(data.urls);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchMyUrls();

    // tab wapas active hotay hi data dobara fetch karo — taake link open karne ke baad
    // "Total Clicks" purana (stale) number na dikhaye
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchMyUrls();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shortenUrl = async () => {
    setError("");
    setShortUrl("");
    if (!longUrl.trim()) {
      setError("Please enter a URL");
      return;
    }
    setLoading(true);
    try {
      const res = await fetchWithRetry(`${API_URL}/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ longUrl, customAlias }),
      });
      const data = await res.json();
      if (data.ok) {
        setShortUrl(data.shortURL);
        setLongUrl("");
        setCustomAlias("");
        fetchMyUrls();
      } else {
        setError(data.message || "Something went wrong");
      }
    } catch (err) {
      setError("Server is waking up — please try again in a few seconds");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (url) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const viewAnalytics = async (shortId) => {
    setAnalyticsFor(shortId);
    setAnalyticsData(null);
    try {
      const res = await fetchWithRetry(`${API_URL}/api/analytics/${shortId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) setAnalyticsData(data);
    } catch (err) {
      console.error(err);
    }
  };

  const getChartData = (totalClicks, recentClicks) => {
    if (recentClicks && recentClicks.length > 0) {
      const counts = {};
      recentClicks.forEach((c) => {
        const day = new Date(c.clickedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
        counts[day] = (counts[day] || 0) + 1;
      });
      return Object.entries(counts).map(([date, count]) => ({ date, count }));
    }
    if (totalClicks > 0) {
      return [{ date: "Total", count: totalClicks }];
    }
    return [];
  };

  // stat cards + donut chart ke liye totals
  const totalClicksAll = myUrls.reduce((sum, u) => sum + (u.totalClicks || 0), 0);

  return (
    <div
      className="max-w-xl mx-auto relative rounded-3xl overflow-hidden"
      style={{
        backgroundImage:
          "linear-gradient(to bottom, rgba(15,10,35,0.88), rgba(15,10,35,0.95)), url('https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=80')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="p-4 sm:p-6">
        <h1 className="font-display text-3xl font-extrabold text-white mb-6">👋 Welcome, {user?.name}</h1>

        <StatsRow totalLinks={myUrls.length} totalClicks={totalClicksAll} plan={subscription?.plan} />
        <OverviewPanel totalLinks={myUrls.length} totalClicks={totalClicksAll} />

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-8 mb-6">
          <div className="flex flex-col gap-3">
            <input type="text" value={longUrl} onChange={(e) => setLongUrl(e.target.value)} placeholder="https://example.com/long-url" className="w-full px-4 py-3.5 rounded-xl bg-slate-900/80 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition" />
            <input type="text" value={customAlias} onChange={(e) => setCustomAlias(e.target.value)} placeholder="Custom name (optional)" className="w-full px-4 py-3.5 rounded-xl bg-slate-900/80 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition" />
            <button onClick={shortenUrl} disabled={loading} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-400 hover:to-fuchsia-400 disabled:opacity-50 text-white font-bold shadow-lg hover:scale-[1.02] transition-all duration-200">
              {loading ? "Shortening..." : "⚡ Shorten URL"}
            </button>
          </div>

          {error && <p className="text-amber-400 text-sm mt-4 text-center">⏳ {error}</p>}

          {shortUrl && (
            <div className="mt-6">
              <div className="bg-slate-900/80 border border-violet-500/30 rounded-xl p-4 flex items-center justify-between gap-2">
                <a href={shortUrl} target="_blank" rel="noreferrer" className="text-violet-300 font-semibold truncate hover:underline">{shortUrl}</a>
                <button onClick={() => copyToClipboard(shortUrl)} className="shrink-0 px-3 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-violet-600 text-white transition">
                  {copied ? "✅ Copied" : "📋 Copy"}
                </button>
              </div>
              <div className="mt-4 bg-white rounded-xl p-4 flex justify-center">
                <QRCodeSVG value={shortUrl} size={140} />
              </div>
            </div>
          )}
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-6">
          <h2 className="text-white font-bold text-xl mb-4">🔗 My URLs</h2>
          {myUrls.length === 0 && <p className="text-slate-500 text-sm">No URLs created yet</p>}
          <div className="flex flex-col gap-3">
            {myUrls.map((item) => (
              <div key={item._id} className="bg-slate-900/70 border border-white/10 rounded-xl p-3 hover:border-violet-500/40 transition">
                <p className="text-slate-500 text-xs truncate mb-1">{item.longUrl}</p>
                <div className="flex items-center justify-between gap-2">
                  <a href={`${API_URL}/${item.shortId}`} target="_blank" rel="noreferrer" className="text-violet-300 text-sm font-semibold truncate hover:underline">{API_URL}/{item.shortId}</a>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => copyToClipboard(`${API_URL}/${item.shortId}`)} className="px-2 py-1 text-xs rounded-md bg-slate-700 hover:bg-violet-600 text-white transition">Copy</button>
                    <button onClick={() => viewAnalytics(item.shortId)} className="px-2 py-1 text-xs rounded-md bg-slate-700 hover:bg-fuchsia-600 text-white transition">📊 Stats</button>
                  </div>
                </div>
                {analyticsFor === item.shortId && analyticsData && (
                  <div className="mt-3 bg-slate-800 rounded-lg p-4">
                    <p className="text-violet-300 font-bold text-lg mb-2">{analyticsData.totalClicks} total clicks</p>
                    {getChartData(analyticsData.totalClicks, analyticsData.recentClicks).length > 0 ? (
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={getChartData(analyticsData.totalClicks, analyticsData.recentClicks)}>
                          <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                          <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                          <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }} labelStyle={{ color: "#e2e8f0" }} />
                          <Bar dataKey="count" fill="#a78bfa" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-slate-500 text-xs">No clicks yet — open the link to see data here.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// "Analytics" page — TinyURL ke hisab se adapted "business performance" style overview
function AnalyticsPage({ token }) {
  const [myUrls, setMyUrls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchWithRetry(`${API_URL}/api/my-urls`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok) setMyUrls(data.urls);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();

    // tab wapas active hotay hi data dobara fetch karo (stale clicks na dikhayen)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [token]);

  const totalLinks = myUrls.length;
  const totalClicks = myUrls.reduce((sum, u) => sum + (u.totalClicks || 0), 0);
  const avgClicks = totalLinks > 0 ? (totalClicks / totalLinks).toFixed(1) : 0;
  const topLinks = [...myUrls].sort((a, b) => (b.totalClicks || 0) - (a.totalClicks || 0)).slice(0, 5);

  // sample/demo goals — abhi koi "target" system backend mein track nahi hota
  const linksGoalPct = Math.min(100, Math.round((totalLinks / 50) * 100));
  const clicksGoalPct = Math.min(100, Math.round((totalClicks / 500) * 100));

  const chartData = (() => {
    const counts = {};
    myUrls.forEach((u) => {
      const day = new Date(u.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      counts[day] = (counts[day] || 0) + 1;
    });
    return Object.entries(counts).map(([date, count]) => ({ date, count }));
  })();

  if (loading) return <p className="text-slate-400 text-center py-20">Loading analytics...</p>;

  return (
    <div>
      <h1 className="font-display text-3xl font-extrabold text-white mb-1">📈 Analytics Overview</h1>
      <p className="text-slate-400 mb-8">An overview of your links' performance.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Links", value: totalLinks, gradient: "from-violet-600 to-purple-500" },
          { label: "Total Clicks", value: totalClicks, gradient: "from-fuchsia-600 to-pink-500" },
          { label: "Avg Clicks/Link", value: avgClicks, gradient: "from-blue-600 to-cyan-500" },
          { label: "Active Links", value: totalLinks, gradient: "from-amber-500 to-orange-500" },
        ].map((c) => (
          <div key={c.label} className={`bg-gradient-to-br ${c.gradient} rounded-2xl p-5 text-white shadow-lg`}>
            <p className="text-xs opacity-90">{c.label}</p>
            <p className="font-bold mt-1 text-2xl">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-3 gap-5 mb-6">
        <div className="sm:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="text-white font-bold mb-3">Links Created Over Time</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }} />
                <Bar dataKey="count" fill="#a78bfa" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-sm">No links created yet.</p>
          )}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center gap-4">
          <RadialGauge label="Links Goal" value={linksGoalPct} color="#8b5cf6" size={100} />
          <RadialGauge label="Clicks Goal" value={clicksGoalPct} color="#3b82f6" size={100} />
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <h3 className="text-white font-bold mb-4">🏆 Top Performing Links</h3>
        {topLinks.length === 0 ? (
          <p className="text-slate-500 text-sm">No links found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="py-2 pr-4">Short Link</th>
                  <th className="py-2 pr-4">Clicks</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {topLinks.map((u) => (
                  <tr key={u._id} className="border-b border-white/5">
                    <td className="py-2 pr-4 text-violet-300 truncate max-w-[200px]">{API_URL}/{u.shortId}</td>
                    <td className="py-2 pr-4 text-white font-semibold">{u.totalClicks || 0}</td>
                    <td className="py-2">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400">Active</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// footer — har page pe dikhega kyunke yeh App() ke root level pe laga hai
function Footer() {
  return (
    <footer className="border-t border-white/10 bg-slate-950/70 py-4 text-center">
      <p className="text-slate-500 text-xs">Dev by Abdullah Lateef</p>
    </footer>
  );
}

// ================= CHAT WIDGET =================
function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { from: "bot", text: "Hi! 👋 Ask me anything about TinyURL — shortening links, analytics, or accounts." },
  ]);
  const [input, setInput] = useState("");

  const faq = [
    { keys: ["shorten", "how", "create"], answer: "Just paste your long URL in the box on the Home page or Dashboard, and click 'Shorten URL'." },
    { keys: ["alias", "custom", "name"], answer: "You can add a custom name in the 'Custom name (optional)' field when shortening a link." },
    { keys: ["analytics", "clicks", "track", "stats"], answer: "Click the '📊 Stats' button next to any link in 'My URLs' to see a chart of your clicks." },
    { keys: ["signup", "account", "register"], answer: "Click 'Sign Up' in the top right to create a free account." },
    { keys: ["login", "log in"], answer: "Click 'Login' in the top right and enter your email and password." },
    { keys: ["qr", "code"], answer: "A QR code is automatically generated for every link you shorten in the Dashboard." },
    { keys: ["slow", "not working", "wake", "connect"], answer: "If the server was inactive, it may take a few seconds to wake up. Just try again!" },
    { keys: ["pro", "upgrade", "subscription", "pricing"], answer: "Head to the Plans section on the Home page to upgrade to Pro — payments are handled securely through Stripe." },
  ];

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = { from: "user", text: input };
    const lower = input.toLowerCase();
    const match = faq.find((f) => f.keys.some((k) => lower.includes(k)));
    const botMsg = {
      from: "bot",
      text: match ? match.answer : "I'm not sure about that — try asking about shortening links, custom aliases, analytics, or accounts!",
    };
    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput("");
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3 w-80 bg-slate-800 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-3 flex items-center justify-between">
            <span className="text-white font-bold">💬 Help Assistant</span>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white">✕</button>
          </div>
          <div className="flex-1 max-h-80 overflow-y-auto p-3 flex flex-col gap-2">
            {messages.map((m, i) => (
              <div key={i} className={`text-sm px-3 py-2 rounded-xl max-w-[85%] ${m.from === "bot" ? "bg-slate-700 text-slate-200 self-start" : "bg-violet-600 text-white self-end"}`}>
                {m.text}
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-white/10 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask a question..."
              className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button onClick={handleSend} className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition">➤</button>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(!open)} className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/40 flex items-center justify-center text-2xl hover:scale-110 transition-transform duration-200">
        💬
      </button>
    </div>
  );
}

export default App;