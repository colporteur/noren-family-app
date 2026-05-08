import { Link } from 'react-router-dom';

export default function DictatorIndex() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-primary-900">
          Dictator Mode
        </h1>
        <p className="text-slate-600 mt-1">
          With great power comes great paperwork. These tools are visible only
          to Dictators.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/dictator/members" className="card hover:-translate-y-0.5 hover:shadow-lg transition">
          <h2 className="font-display text-lg text-primary-900">Manage Family</h2>
          <p className="text-sm text-slate-600 mt-1">
            Change roles, mark someone deceased, or remove an account.
          </p>
        </Link>
        <Link to="/dictator/invite" className="card hover:-translate-y-0.5 hover:shadow-lg transition">
          <h2 className="font-display text-lg text-primary-900">Invite a Guest</h2>
          <p className="text-sm text-slate-600 mt-1">
            Add a temporary guest with an expiration date.
          </p>
        </Link>
      </div>
    </div>
  );
}
