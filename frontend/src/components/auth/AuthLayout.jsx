import BrandMark from '../BrandMark.jsx';

export default function AuthLayout({ title, subtitle, children, footer, wide = false }) {
  return (
    <main className="auth-shell">
      <div className="auth-grid">
        <section className="auth-visual" aria-label="Delivery across the city">
          <img className="auth-visual-image" src="/landing/auth-rider.png" alt="" loading="eager" />
          <div className="auth-visual-top"><BrandMark dark /></div>
          <div className="auth-visual-copy">
            <h2>Delivery, in sync.</h2>
            <p>From kitchen to doorstep.</p>
          </div>
        </section>

        <section className="auth-form-side">
          <div className="auth-form-top"><BrandMark /></div>
          <div className={`auth-form-wrap${wide ? ' auth-form-wrap--wide' : ''}`}>
            <div className="auth-form-header">
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
            <div className="auth-form-panel">{children}</div>
            {footer}
          </div>
        </section>
      </div>
    </main>
  );
}
