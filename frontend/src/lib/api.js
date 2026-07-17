import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

// Attach office JWT to every request when available
api.interceptors.request.use((config) => {
  const raw = localStorage.getItem("samaadhaan_office");
  if (raw) {
    try {
      const { token } = JSON.parse(raw);
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch {}
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && localStorage.getItem("samaadhaan_office")) {
      localStorage.removeItem("samaadhaan_office");
      if (!window.location.pathname.startsWith("/office/login")) {
        window.location.href = "/office/login";
      }
    }
    return Promise.reject(err);
  }
);

export const LANGS = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi (हिन्दी)" },
  { code: "mr", label: "Marathi (मराठी)" },
  { code: "ta", label: "Tamil (தமிழ்)" },
  { code: "te", label: "Telugu (తెలుగు)" },
  { code: "bn", label: "Bengali (বাংলা)" },
  { code: "gu", label: "Gujarati (ગુજરાતી)" },
  { code: "kn", label: "Kannada (ಕನ್ನಡ)" },
  { code: "ml", label: "Malayalam (മലയാളം)" },
  { code: "pa", label: "Punjabi (ਪੰਜਾਬੀ)" },
];

export const SPEECH_LOCALE = {
  en: "en-IN", hi: "hi-IN", mr: "mr-IN", ta: "ta-IN", te: "te-IN",
  bn: "bn-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN",
};

export const PRIORITY_COLOR = {
  urgent: "bg-red-100 text-red-800 border-red-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  normal: "bg-blue-50 text-blue-800 border-blue-200",
  low: "bg-gray-100 text-gray-700 border-gray-200",
};
