const express = require('express')
const app = express()
app.use(express.json())

let data = {
  categories: [
    { id: 'c1', name: 'Oshxona Stollari', icon: '🪑', sort_order: 1, is_active: true },
    { id: 'c2', name: 'Oshxona Stullari', icon: '💺', sort_order: 2, is_active: true },
    { id: 'c3', name: 'Shkaflar', icon: '🗄️', sort_order: 3, is_active: true },
    { id: 'c4', name: 'Polkalar', icon: '📚', sort_order: 4, is_active: true },
    { id: 'c5', name: 'Jihozlar', icon: '🔧', sort_order: 5, is_active: true }
  ],
  products: [
    { id: 'p1', category_id: 'c1', name: 'Oshxona stoli Artel', description: 'Zamonaviy oshxona stoli', price: 2500000, image_url: '', stock: 10, is_active: true },
    { id: 'p2', category_id: 'c2', name: 'Plastik stul', description: 'Oshxona uchun plastik stul', price: 450000, image_url: '', stock: 50, is_active: true }
  ],
  cart: [],
  orders: []
}

/* Categories */
app.get('/api/categories', (req, res) => {
  res.json(data.categories.filter(c => c.is_active))
})

/* Products */
app.get('/api/products', (req, res) => {
  res.json(data.products.filter(p => p.is_active))
})

app.get('/api/products/:id', (req, res) => {
  const p = data.products.find(p => p.id === req.params.id)
  res.json(p || {})
})

/* Cart */
app.get('/api/cart', (req, res) => {
  const userId = req.query.user_id
  res.json(data.cart.filter(c => c.user_id === userId))
})

app.post('/api/cart', (req, res) => {
  const item = req.body
  data.cart.push(item)
  res.json(item)
})

/* Orders */
app.post('/api/orders', (req, res) => {
  const order = req.body
  order.id = 'ord-' + Date.now()
  data.orders.push(order)
  res.json(order)
})

app.get('/api/orders', (req, res) => {
  res.json(data.orders)
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Local backend listening on http://localhost:' + PORT))
