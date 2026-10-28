import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/admin', label: 'Overview & Analytics', end: true },
  { to: '/admin/courses', label: 'Course Management' },
  { to: '/admin/course-editor', label: 'Course & Lesson Editor' },
  { to: '/admin/classes', label: 'Live Classroom Management' },
  { to: '/admin/students', label: 'Student Management' },
  { to: '/admin/instructors', label: 'Instructor Management' },
  { to: '/admin/enrollments', label: 'Enrollment Management' },
  { to: '/admin/launch', label: 'Public Launch Settings' },
  { to: '/admin/payments', label: 'Payment & Plan Configuration' },
  { to: '/admin/credits', label: 'App Credit Administration' },
  { to: '/admin/support', label: 'Support & Messaging' },
  { to: '/admin/system', label: 'System Health & Integration' },
  { to: '/admin/audit', label: 'Audit Logs & Activity' },
]

export function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="page-shell admin-shell">
      <section className="page-hero learner-hero">
        <div className="eyebrow"><span className="eyebrow-dot" /> PLATFORM ADMINISTRATION</div>
        <h1>Admin Control Center<span>.</span></h1>
        <p>Complete platform administration and operations management.</p>
      </section>
      <section className="section admin-layout">
        <button
          className="admin-menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          type="button"
        >
          {menuOpen ? 'Close Menu' : 'Open Menu'}
        </button>
        <nav className={menuOpen ? 'admin-nav is-open' : 'admin-nav'}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => isActive ? 'admin-nav-link active' : 'admin-nav-link'}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="admin-content">
          <Outlet />
        </main>
      </section>
    </div>
  )
}
