import React from 'react';
import { BrowserRouter as Router, Route, Routes, Link } from "react-router-dom";
import Login from './Login';
import Contact from './Contact';
import Home from './Home';
import About from './About';
import './App.css';
import FarmersKnowledgeCenter from './FarmerKnowlege';
import Products from './products';
import Fertilizers from './fertilizers';
import Weather from './weather';

function App() {
  return (
    <div className="app-container">
      
      <header className="header">
        <h1 className="agrititle">🌱 Welcome to Agricultural Info App</h1>
      </header>

     
      <Router>
        <nav className="navbar">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/about" className="nav-link">About Us</Link>
          <Link to="/farmer" className="nav-link">Farmer Knowledge</Link>
          <Link to="/product" className="nav-link">Products</Link>
          <Link to="/fertilizer" className="nav-link">Fertilizers</Link>
          <Link to="/weather" className="nav-link">weather</Link>
          <Link to="/contact" className="nav-link">Contact</Link>
          <Link to="/login" className="nav-link">Login</Link>
        </nav>

       
        <main className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/farmer" element={<FarmersKnowledgeCenter />} />
            <Route path="/product" element={<Products />} />
            <Route path="/fertilizer" element={<Fertilizers />} />
            <Route path="/weather" element={<Weather />} />
            <Route path="/login" element={<Login />} />
            <Route path="/contact" element={<Contact />} />
          </Routes>
        </main>
      </Router>


      <footer className="footer">
        <p>© 2025 Agricultural Website. All Rights Reserved.  
        Design by <strong>Krish Radadiya</strong></p>
      </footer>
    </div>
  );
}

export default App;
