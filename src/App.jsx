import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [expenses, setExpenses] = useState([])
  const [profiles, setProfiles] = useState([])
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('Spesa')
  const [paidBy, setPaidBy] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [message, setMessage] = useState('')
  const [descriptions, setDescriptions] = useState([])
const [selectedMonth, setSelectedMonth] = useState(() => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
})
  // Controlla se l'utente è loggato
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Carica dati quando c'è una sessione
  useEffect(() => {
    if (session) {
      fetchProfiles()
      fetchExpenses()
    }
  }, [session])

  async function fetchProfiles() {
    const { data } = await supabase.from('profiles').select('*')
    setProfiles(data || [])
    if (data && data.length > 0 && !paidBy) {
      setPaidBy(data[0].id)

      const uniqueDescriptions = [...new Set((data || []).map(e => e.description).filter(Boolean))]
setDescriptions(uniqueDescriptions)

    }
  }

  async function fetchExpenses() {
  const { data } = await supabase
    .from('expenses')
    .select('*, profiles(name)')
    .order('expense_date', { ascending: false })
  
  setExpenses(data || [])
  
  // Estrai descrizioni uniche
  const unique = [...new Set(
    (data || [])
      .map(e => e.description)
      .filter(d => d && d.trim() !== '')
  )]
  setDescriptions(unique)
}

  async function handleLogin(e) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) alert('Errore di login: ' + error.message)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  async function addExpense(e) {
  e.preventDefault()
  if (!description || !amount || !paidBy) return alert('Compila tutti i campi')

  const expenseData = {
    description,
    amount: parseFloat(amount),
    category,
    paid_by: paidBy,
    expense_date: `${selectedMonth}-01`
  }

  let error

  if (editingId) {
    // Modifica esistente
    const { error: updateError } = await supabase
      .from('expenses')
      .update(expenseData)
      .eq('id', editingId)
    error = updateError
  } else {
    // Nuova spesa
    const { error: insertError } = await supabase
      .from('expenses')
      .insert(expenseData)
    error = insertError
  }

  if (error) {
    alert('Errore: ' + error.message)
  } else {
    setDescription('')
    setAmount('')
    setEditingId(null)
    setShowForm(false)
    setMessage(editingId ? 'Spesa aggiornata!' : 'Spesa salvata!')
    setTimeout(() => setMessage(''), 2000)
    fetchExpenses()
  }
}

  function startEdit(expense) {
  setEditingId(expense.id)
  setDescription(expense.description)
  setAmount(expense.amount)
  setCategory(expense.category)
  setPaidBy(expense.paid_by)
  setSelectedMonth(expense.expense_date.slice(0, 7))
  setShowForm(true)
}

  async function deleteExpense(id) {
    if (!confirm('Eliminare questa spesa?')) return
    await supabase.from('expenses').delete().eq('id', id)
    fetchExpenses()
  }

  // Calcoli
  const [selectedYear, selectedMonthNum] = selectedMonth.split('-').map(Number)

const monthExpenses = expenses.filter(e => {
  const d = new Date(e.expense_date)
  return d.getMonth() + 1 === selectedMonthNum && d.getFullYear() === selectedYear
})

  const totalMonth = monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0)

  // Calcolo saldo (semplice 50/50)
  let balance = 0
  if (profiles.length === 2) {
    const [p1, p2] = profiles
    let p1Paid = 0
    let p2Paid = 0

    monthExpenses.forEach(e => {
      if (e.paid_by === p1.id) p1Paid += Number(e.amount)
      if (e.paid_by === p2.id) p2Paid += Number(e.amount)
    })

    // Ognuno dovrebbe pagare la metà del totale
    const half = totalMonth / 2
    balance = p1Paid - half   // positivo = p1 ha pagato di più
  }

  if (loading) return <div className="container">Caricamento...</div>

  // ===== PAGINA LOGIN =====
  if (!session) {
    return (
      <div className="container">
        <h1>Spese Famiglia</h1>
        <form onSubmit={handleLogin} className="card">
          <h2>Accedi</h2>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button type="submit">Entra</button>
        </form>
      </div>
    )
  }

  // ===== APP PRINCIPALE =====
  return (
    <div className="container">
      <header>
        <h1>Spese Famiglia</h1>
        <button onClick={handleLogout} className="btn-logout">Esci</button>
      </header>

      {/* Riepilogo */}
      <div style={{ marginBottom: '16px', textAlign: 'center' }}>
  <select 
    value={selectedMonth} 
    onChange={e => setSelectedMonth(e.target.value)}
    style={{ 
      padding: '10px 16px', 
      borderRadius: '12px', 
      border: '1px solid #ddd', 
      fontSize: '1rem',
      background: 'blue'
    }}
  >
    {Array.from({ length: 12 }, (_, i) => {
      const date = new Date()
      date.setMonth(date.getMonth() - i)
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const label = date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
      return (
        <option key={value} value={value}>
          {label.charAt(0).toUpperCase() + label.slice(1)}
        </option>
      )
    })}
  </select>
</div>

      <div className="summary card">
      <div style={{ marginBottom: '8px', color: '#666', fontSize: '0.95rem' }}>
  {new Date(selectedYear, selectedMonthNum - 1).toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric'
  })}
</div>
<div className="total">
    <span>Totale mese</span>
    <strong>{totalMonth.toFixed(2)} €</strong>
  </div>
        <div className="balance" style={{
  color: balance === 0 ? '#34c759' : '#ff9500',
  fontWeight: '500'
}}>
  {profiles.length === 2 && (
    balance === 0
      ? <span>Siete in pari</span>
      : balance > 0
        ? <span>{profiles[1].name} deve a {profiles[0].name}: <strong>{Math.abs(balance).toFixed(2)} €</strong></span>
        : <span>{profiles[0].name} deve a {profiles[1].name}: <strong>{Math.abs(balance).toFixed(2)} €</strong></span>
  )}
</div>
      </div>

      {message && (
  <div style={{
    background: '#34c759',
    color: 'white',
    padding: '12px',
    borderRadius: '12px',
    textAlign: 'center',
    marginBottom: '16px'
  }}>
    {message}
  </div>
)}

      {/* Pulsante aggiungi */}
      <button className="btn-add" onClick={() => setShowForm(!showForm)}>
        {showForm ? 'Annulla' : '+ Aggiungi spesa'}
      </button>

      {/* Form nuova spesa */}
      {showForm && (
        <form onSubmit={addExpense} className="card form">
          <input
  type="text"
  placeholder="Descrizione (es. Spesa Coop)"
  value={description}
  onChange={e => setDescription(e.target.value)}
  required
/>

{descriptions.length > 0 && (
  <select 
    onChange={e => {
      if (e.target.value) setDescription(e.target.value)
    }}
    defaultValue=""
    style={{ marginTop: '8px' }}
  >
    <option value="">— Oppure scegli una già usata —</option>
    {descriptions.map(desc => (
      <option key={desc} value={desc}>{desc}</option>
    ))}
  </select>
)}

          <input
            type="number"
            step="0.01"
            placeholder="Importo (€)"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            required
          />
          
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
  {Array.from({ length: 12 }, (_, i) => {
    const date = new Date()
    date.setMonth(date.getMonth() - i)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
    return (
      <option key={value} value={value}>
        {label.charAt(0).toUpperCase() + label.slice(1)}
      </option>
    )
  })}
</select>

          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option>Spesa</option>
            <option>Casa</option>
            <option>Trasporti</option>
            <option>Svago</option>
            <option>Salute</option>
            <option>Altro</option>
          </select>
          <select value={paidBy} onChange={e => setPaidBy(e.target.value)}>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button type="submit">
  {editingId ? 'Aggiorna spesa' : 'Salva spesa'}
</button>
        </form>
      )}

      {/* Lista spese */}
      <div className="expenses">
        <h2>Ultime spese</h2>
        {monthExpenses.length === 0 && <p className="empty">Nessuna spesa questo mese</p>}
        {monthExpenses.map(exp => (
          <div key={exp.id} className="expense-item card">
            <div className="expense-info">
              <strong>{exp.description}</strong>
              <span className="meta">{exp.category} · {exp.profiles?.name} · {exp.expense_date}</span>
            </div>
            <div className="expense-right">
  <span className="amount">{Number(exp.amount).toFixed(2)} €</span>
  <button 
    onClick={() => startEdit(exp)}
    style={{ background: 'none', border: 'none', color: '#007aff', cursor: 'pointer', fontSize: '0.9rem', marginRight: '8px' }}
  >
    Modifica
  </button>
  <button className="btn-delete" onClick={() => deleteExpense(exp.id)}>×</button>
</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App