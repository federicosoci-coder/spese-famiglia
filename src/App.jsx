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
  const [settlements, setSettlements] = useState([])
  const [settlementAmount, setSettlementAmount] = useState('')
  const [settlementFrom, setSettlementFrom] = useState('')
  const [descriptions, setDescriptions] = useState([])
  const [showSettlement, setShowSettlement] = useState(false)
  const [isRecurring, setIsRecurring] = useState(false)
  const [dueDay, setDueDay] = useState('')
  const [everyMonths, setEveryMonths] = useState(1)
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
      fetchSettlements()

      // Chiedi permesso notifiche
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
    }
  }, [session])

  async function fetchProfiles() {
    const { data } = await supabase.from('profiles').select('*')
    setProfiles(data || [])
    if (data && data.length > 0 && !paidBy) {
      setPaidBy(data[0].id)

      const uniqueDescriptions = [...new Set((data || []).map(e => e.description).filter(Boolean))]
      setDescriptions(uniqueDescriptions)
      setTimeout(checkRecurringNotifications, 1000)

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
  async function fetchSettlements() {
    const { data } = await supabase
      .from('settlements')
      .select('*')
      .order('settlement_date', { ascending: false })
    setSettlements(data || [])
  }

  function checkRecurringNotifications() {
  console.log('Controllo notifiche...', Notification.permission)
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  const today = new Date()
  const currentDay = today.getDate()

  expenses.forEach(exp => {
    if (exp.is_recurring && exp.due_day) {
      const daysUntil = exp.due_day - currentDay
      if (daysUntil >= 0 && daysUntil <= 3) {
        new Notification('Spesa ricorrente in scadenza', {
          body: `${exp.description} scade tra ${daysUntil} giorni (${exp.due_day})`,
          icon: '/favicon.ico'
        })
      }
    }
  })
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
  expense_date: `${selectedMonth}-01`,
  is_recurring: isRecurring,
  due_day: isRecurring ? (Number(dueDay) || null) : null,
  every_months: isRecurring ? parseInt(everyMonths) || 1 : 1
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

  // Saldo GLOBALE
  const allExpenses = expenses
  const totalAll = allExpenses.reduce((sum, e) => sum + Number(e.amount), 0)

  let balance = 0
  let debtorName = ''
  let creditorName = ''

  if (profiles.length === 2) {
    const personA = profiles[0]
    const personB = profiles[1]

    let expensesPaidByA = 0
    let expensesPaidByB = 0 // eslint-disable-line

    allExpenses.forEach(e => {
      if (e.paid_by === personA.id) expensesPaidByA += Number(e.amount)
      if (e.paid_by === personB.id) expensesPaidByB += Number(e.amount)
    })

    const half = totalAll / 2
    let debt = expensesPaidByA - half

    settlements.forEach(s => {
  if (s.paid_by === personA.id && s.paid_to === personB.id) {
    debt += Number(s.amount)
  }
  if (s.paid_by === personB.id && s.paid_to === personA.id) {
    debt -= Number(s.amount)
  }
})
    balance = debt

    if (debt > 0) {
      creditorName = personA.name
      debtorName = personB.name
    } else if (debt < 0) {
      creditorName = personB.name
      debtorName = personA.name
    }
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
        {balance === 0
          ? <span>Siete in pari</span>
          : <span>{debtorName} deve a {creditorName}: <strong>{Math.abs(balance).toFixed(2)} €</strong></span>
        }
      </div>
      <div style={{ fontSize: '0.75rem', color: 'white', marginTop: '4px' }}>
        Pagamenti: {settlements.length} |
        A: {profiles[0]?.name} |
        B: {profiles[1]?.name}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'white', marginTop: '8px' }}>
        Pagamenti registrati: {settlements.length}
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
    {/* Pulsante pagamento di saldo */}
    <div style={{ marginBottom: '16px' }}>
      <button 
  className="btn-add" 
  style={{ background: '#ff9500' }}
  onClick={() => setShowSettlement(!showSettlement)}
>
  {showSettlement ? 'Chiudi' : 'Registra pagamento di saldo'}
</button>
    </div>
    {/* Form pagamento di saldo */}
    {showSettlement && (
    <div className="card form" style={{ marginBottom: '16px' }}>
      <h3 style={{ marginBottom: '12px' }}>Registra pagamento</h3>
      <input
        type="number"
        step="0.01"
        placeholder="Importo (€)"
        value={settlementAmount}
        onChange={e => setSettlementAmount(e.target.value)}
      />
      <select
        value={settlementFrom}
        onChange={e => setSettlementFrom(e.target.value)}
      >
        <option value="">Chi paga?</option>
        {profiles.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <button
        type="button"
        style={{ background: '#ff9500' }}
        onClick={async () => {
          if (!settlementAmount || !settlementFrom) {
            alert('Compila importo e chi paga')
            return
          }
          const otherPerson = profiles.find(p => p.id !== settlementFrom)
          if (!otherPerson) {
            alert('Non trovo l’altra persona')
            return
          }

          const { error } = await supabase.from('settlements').insert({
            amount: parseFloat(settlementAmount),
            paid_by: settlementFrom,
            paid_to: otherPerson.id
          })

          if (error) {
            alert('Errore: ' + error.message)
          } else {
            alert('Pagamento salvato correttamente!')
            setSettlementAmount('')
            setSettlementFrom('')
            fetchSettlements()
          }
        }}
      >
        Salva pagamento
      </button>
    </div>
)}
    {/* Pulsante aggiungi */}
    <button className="btn-add" onClick={() => setShowForm(!showForm)}>
      {showForm ? 'Chiudi' : '+ Aggiungi spesa'}
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

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '12px 0' }}>
  <input
    type="checkbox"
    checked={isRecurring}
    onChange={e => setIsRecurring(e.target.checked)}
  />
  Spesa ricorrente
</label>

{isRecurring && (
  <>
    <input
      type="number"
      min="1"
      max="31"
      placeholder="Giorno del mese (1-31)"
      value={dueDay}
      onChange={e => setDueDay(e.target.value)}
    />
    <input
      type="number"
      min="1"
      placeholder="Ogni quanti mesi (es. 1, 3, 6)"
      value={everyMonths}
      onChange={e => setEveryMonths(e.target.value)}
    />
  </>
)}
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
            <span className="meta">
  {exp.category} · {exp.profiles?.name} · 
  {exp.is_recurring 
    ? `Giorno ${exp.due_day}` 
    : exp.expense_date
  }
  {exp.is_recurring && (
    <span style={{ color: '#007aff', marginLeft: '8px' }}>
      · Ricorrente ogni {exp.every_months || 1} mesi
    </span>
  )}
</span>
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