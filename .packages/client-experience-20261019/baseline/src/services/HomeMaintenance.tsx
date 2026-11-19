import './HomeMaintenance.css'

export default function HomeMaintenance() {
  return <section className="home-maintenance" aria-labelledby="home-maintenance-title">
    <div className="home-maintenance-content">
      <div className="home-maintenance-compass" aria-hidden="true">
        <svg viewBox="0 0 120 120" fill="none">
          <circle cx="60" cy="60" r="47" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="60" cy="60" r="35" stroke="currentColor" strokeWidth="1" strokeDasharray="2 6" />
          <path d="M60 6v15m0 78v15M6 60h15m78 0h15" stroke="currentColor" strokeWidth="2" />
          <path d="m77 32-7 38-27 18 7-38 27-18Z" fill="currentColor" fillOpacity=".12" />
          <path d="m77 32-27 18 20 20 7-38Z" fill="currentColor" />
          <circle cx="60" cy="60" r="4" fill="white" />
        </svg>
      </div>
      <span className="home-maintenance-status">A little work in progress</span>
      <h1 id="home-maintenance-title">More is on the horizon.</h1>
      <p>The COMPASS Home space is currently under maintenance. We're making room for more helpful features and information in the future.</p>
      <div className="home-maintenance-rule" aria-hidden="true" />
      <p className="home-maintenance-note">Your work can continue. Use the navigation to access clients, programs, and your work.</p>
    </div>
  </section>
}
