import { useMemo, useState } from 'react';
import { BookOpen, FileText, Search } from 'lucide-react';

const money = units => `$${(Number(units) / 1_000_000).toFixed(2).replace(/\.00$/, '')} USDC`;

export default function ProductStore({ products, onSelect, loading, health }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');

  const categories = useMemo(() => ['All', ...new Set(products.map(item => item.category))], [products]);

  const visible = products
    .filter(item => category === 'All' || item.category === category)
    .filter(item => `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(query.toLowerCase()));

  const offline = health && !health.online;

  return (
    <section id="explore" className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-300 font-mono">Explore tools</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Choose a useful next step.</h2>
          <p className="mt-2 text-slate-400">Read what is included, the requirements, and license before purchase.</p>
        </div>

        {products.length > 0 && (
          <label className="relative w-full md:w-80">
            <span className="sr-only">Search products</span>
            <Search className="absolute left-3 top-3 text-slate-400 w-4 h-4"/>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
              placeholder="Search products"
            />
          </label>
        )}
      </div>

      {products.length > 0 && (
        <div className="flex gap-2 overflow-auto pb-5">
          {categories.map(value => (
            <button
              key={value}
              onClick={() => setCategory(value)}
              className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition font-medium ${
                category === value ? 'bg-purple-600 text-white' : 'bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Loading products…</p>
      ) : products.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 max-w-2xl">
          <h3 className="text-xl font-bold text-white">The store is opening soon.</h3>
          <p className="mt-2 text-slate-400">
            {offline
              ? 'We are preparing the first products and secure checkout. Please check back shortly.'
              : 'No products have been published yet. Please check back shortly.'}
          </p>
        </div>
      ) : visible.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map(item => (
            <article key={item.id} className="glass-panel rounded-2xl p-6 flex flex-col justify-between border border-slate-800/90 hover:border-purple-500/40 transition group">
              <div>
                <div className="flex justify-between items-center gap-3">
                  <span className="text-xs font-mono text-cyan-300 px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/40">{item.category}</span>
                  <span className="text-xs text-slate-400 font-mono">v{item.version}</span>
                </div>
                <h3 className="mt-3 text-lg font-bold text-white group-hover:text-purple-300 transition line-clamp-2">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed line-clamp-3">{item.description}</p>
                {item.file_name && (
                  <p className="mt-4 flex items-center gap-2 text-xs text-slate-300 font-mono">
                    <FileText className="w-4 h-4 text-purple-300 flex-shrink-0"/>
                    <span>{item.file_name}{item.file_size ? ` · ${(item.file_size / 1024 / 1024).toFixed(1)} MB` : ''}</span>
                  </p>
                )}
              </div>

              <div className="mt-6 pt-5 border-t border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <strong className="text-white text-xl font-bold font-mono">{money(item.price_units)}</strong>
                  <p className="text-[10px] text-slate-400 font-mono">Download in your library after payment confirms</p>
                </div>
                <button
                  onClick={() => onSelect(item)}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold flex gap-2 items-center transition"
                >
                  <BookOpen className="w-4 h-4"/><span>Details</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="glass-panel rounded-2xl p-8 max-w-2xl">
          <h3 className="text-xl font-bold text-white">No products match your search.</h3>
          <p className="mt-2 text-slate-400">Try selecting "All" or using different search keywords.</p>
        </div>
      )}
    </section>
  );
}

export { money };
