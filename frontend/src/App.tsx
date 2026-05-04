import { BrowserRouter, Route, Routes } from 'react-router-dom'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div className="p-8 text-2xl font-bold">ChipIn 🚀</div>} />
      </Routes>
    </BrowserRouter>
  )
}
