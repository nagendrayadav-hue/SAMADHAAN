import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Home from "@/pages/Home";
import CustomerEntry from "@/pages/CustomerEntry";
import ServiceForm from "@/pages/ServiceForm";
import CustomerHistory from "@/pages/CustomerHistory";
import OfficeLogin from "@/pages/OfficeLogin";
import OfficeDashboard from "@/pages/OfficeDashboard";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/customer" element={<CustomerEntry />} />
          <Route path="/customer/service" element={<ServiceForm />} />
          <Route path="/customer/history" element={<CustomerHistory />} />
          <Route path="/office/login" element={<OfficeLogin />} />
          <Route path="/office/dashboard" element={<OfficeDashboard />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
