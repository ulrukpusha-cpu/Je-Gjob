import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  MapPin, 
  Search, 
  Briefcase, 
  User, 
  Hammer, 
  Baby, 
  Utensils, 
  Wrench, 
  Paintbrush, 
  Car, 
  Loader2,
  Euro,
  Camera,
  Check,
  SlidersHorizontal,
  X,
  Info,
  Sun,
  Moon,
  Crown,
  CreditCard,
  Star,
  ShieldCheck,
  Zap,
  MessageSquareQuote,
  Mail,
  Bell,
  BellRing,
  ArrowLeft,
  PlusCircle
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

// --- Constants ---

const CATEGORIES = [
  { id: 'all', label: 'Tout', icon: <Briefcase size={18} /> },
  { id: 'menage', label: 'Ménage', icon: <User size={18} /> },
  { id: 'babysitter', label: 'Baby Sitter', icon: <Baby size={18} /> },
  { id: 'plombier', label: 'Plombier', icon: <Wrench size={18} /> },
  { id: 'cuisinier', label: 'Cuisinier', icon: <Utensils size={18} /> },
  { id: 'menuisier', label: 'Menuisier', icon: <Hammer size={18} /> },
  { id: 'mecanicien', label: 'Mécanicien', icon: <Car size={18} /> },
  { id: 'peintre', label: 'Peintre', icon: <Paintbrush size={18} /> }
];

const AVAILABILITY_OPTIONS = [
  { id: 'all', label: 'Peu importe' },
  { id: 'Immédiat', label: 'Immédiat' },
  { id: 'Week-end', label: 'Week-end' },
  { id: 'Soirée', label: 'Soirée' },
  { id: 'Semaine', label: 'Semaine' }
];

const DATE_OPTIONS = [
  { id: 'all', label: 'Peu importe' },
  { id: 'today', label: "Aujourd'hui" },
  { id: 'week', label: 'Cette semaine' },
  { id: 'month', label: 'Ce mois' }
];

// --- Mock Data Generators for Notifications ---
const MOCK_TITLES = {
  menage: ["Nettoyage fin de chantier", "Ménage hebdomadaire 2h", "Lavage vitres véranda"],
  babysitter: ["Garde enfant soirée", "Sortie d'école urgente", "Baby-sitter ce weekend"],
  plombier: ["Fuite sous évier", "Remplacement robinet", "Débouchage canalisation"],
  cuisinier: ["Préparation repas famille", "Aide cuisine événement", "Traiteur à domicile"],
  menuisier: ["Montage meuble IKEA", "Réparation porte placard", "Pose étagères"],
  mecanicien: ["Vidange voiture", "Changement plaquettes", "Diagnostic bruit moteur"],
  peintre: ["Peinture chambre", "Rafraîchissement salon", "Peinture volets"],
  default: ["Aide déménagement", "Jardinage", "Cours particulier"]
};

const MOCK_REVIEWS_COMMENTS = [
  "Super travail, très professionnel et ponctuel. Je recommande !",
  "Efficace et sympathique. Merci pour le coup de main.",
  "La mission s'est très bien passée, rien à redire.",
  "Personne de confiance, travail soigné.",
  "Très bonne communication et résultat impeccable."
];

const MOCK_CLIENT_NAMES = ["Sophie D.", "Marc L.", "Julie B.", "Thomas M.", "Emma R.", "Lucas P."];

// --- AI Configuration (Gemini / OpenAI / Groq) ---

type AIProvider = 'gemini' | 'openai' | 'groq';

const AI_PROVIDER: AIProvider = (process.env.AI_PROVIDER as AIProvider) || 'gemini';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const TELEGRAM_PREMIUM_INVOICE_SLUG = process.env.TELEGRAM_PREMIUM_INVOICE_SLUG;
const DJAMO_PAYMENT_URL = process.env.DJAMO_PAYMENT_URL;
const WAVE_QR_URL = process.env.WAVE_QR_URL;

// Client Gemini initialisé uniquement si une clé est fournie
const geminiClient = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// --- Main Component ---

const App = () => {
  // Theme State
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('je_gjobe_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  // State
  const [currentView, setCurrentView] = useState('home');
  const [viewHistory, setViewHistory] = useState([]);
  const [locationName, setLocationName] = useState("Localisation inconnue");
  const [coords, setCoords] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [appliedJobs, setAppliedJobs] = useState(new Set());
  const [appliedJobHistory, setAppliedJobHistory] = useState([]);
  const [completedJobIds, setCompletedJobIds] = useState(new Set());
  const [confirmingJobId, setConfirmingJobId] = useState(null);
  const [cancelingJobId, setCancelingJobId] = useState(null);
  const [sortBy, setSortBy] = useState('default');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  
  // Public Profile View State
  const [selectedPublicProfile, setSelectedPublicProfile] = useState(null);

  // Notification State
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem('je_gjobe_notifications') === 'true';
  });

  // Filters State
  const [showFilters, setShowFilters] = useState(false);
  const [filterMaxPrice, setFilterMaxPrice] = useState(200);
  const [filterMaxDistance, setFilterMaxDistance] = useState(30);
  const [filterAvailability, setFilterAvailability] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
  const [filterTag, setFilterTag] = useState(null);

  // Initialize profile from localStorage if available
  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('je_gjobe_profile');
      return saved ? JSON.parse(saved) : {
        name: '',
        email: '',
        jobTitle: '',
        skills: [],
        bio: '',
        locationPreference: '',
        availability: '',
        isCreated: false,
        profilePicture: undefined,
        isPremium: false,
        reviews: [],
        completedMissions: 0
      };
    } catch (e) {
      console.error("Failed to load profile from storage", e);
      return {
        name: '',
        email: '',
        jobTitle: '',
        skills: [],
        bio: '',
        locationPreference: '',
        availability: '',
        isCreated: false,
        profilePicture: undefined,
        isPremium: false,
        reviews: [],
        completedMissions: 0
      };
    }
  });

  // Telegram WebApp state (auto-inscription)
  const [isTelegramWebApp, setIsTelegramWebApp] = useState(false);
  const [telegramUser, setTelegramUser] = useState(null);

  // Navigation Handlers
  const handleNavigate = (view) => {
    if (view === currentView) return;
    setViewHistory(prev => [...prev, currentView]);
    setCurrentView(view);
    window.scrollTo(0, 0);
  };

  const handleBack = () => {
    if (viewHistory.length === 0) return;
    const prevView = viewHistory[viewHistory.length - 1];
    setViewHistory(prev => prev.slice(0, -1));
    setCurrentView(prevView);
    window.scrollTo(0, 0);
  };

  const handleHomeClick = () => {
    setViewHistory([]);
    setCurrentView('home');
    window.scrollTo(0, 0);
  };

  // Theme Effect
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('je_gjobe_theme', theme);
  }, [theme]);

  // Telegram WebApp auto-inscription
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tg = (window).Telegram?.WebApp;
    if (!tg) return;

    setIsTelegramWebApp(true);
    try {
      tg.ready();
      if (tg.expand) tg.expand();
    } catch (e) {
      console.warn('Telegram WebApp init error', e);
    }

    const user = tg.initDataUnsafe?.user;
    if (user) {
      setTelegramUser(user);
      setProfile(prev => {
        if (prev.isCreated) return prev;
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        const usernameEmail = user.username ? `${user.username}@telegram.me` : '';
        return {
          ...prev,
          name: fullName || user.username || prev.name || 'Utilisateur Telegram',
          email: prev.email || usernameEmail,
          isCreated: true,
          telegramId: user.id
        };
      });
    }
  }, []);

  // Persist Profile Effect
  useEffect(() => {
    if (profile.isCreated) {
        localStorage.setItem('je_gjobe_profile', JSON.stringify(profile));
    }
  }, [profile]);

  // Persist Notification State
  useEffect(() => {
    localStorage.setItem('je_gjobe_notifications', String(notificationsEnabled));
  }, [notificationsEnabled]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const toggleNotifications = async () => {
    if (!notificationsEnabled) {
      // Request permission
      if ("Notification" in window) {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          new Notification("Notifications activées", {
            body: "Vous recevrez des alertes pour les nouvelles offres correspondant à vos critères."
          });
          setNotificationsEnabled(true);
        } else {
          // Fallback if denied
          alert("Notifications simulées activées (Permission navigateur refusée).");
          setNotificationsEnabled(true);
        }
      } else {
        alert("Notifications simulées activées (Navigateur non compatible).");
        setNotificationsEnabled(true);
      }
    } else {
      setNotificationsEnabled(false);
    }
  };

  // 1. Get Location on Mount
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setCoords({ lat: latitude, lng: longitude });
          await reverseGeocode(latitude, longitude);
          setLoadingLocation(false);
        },
        (error) => {
          console.error("Error getting location", error);
          setLocationName("Paris, France (Par défaut)");
          setCoords({ lat: 48.8566, lng: 2.3522 }); // Default to Paris
          setLoadingLocation(false);
        }
      );
    } else {
      setLocationName("Non supporté");
      setLoadingLocation(false);
    }
  }, []);

  // 2. Fetch Jobs when category or coords change
  useEffect(() => {
    if (coords && jobs.length === 0) { // Only fetch if list is empty to avoid overwriting posted jobs immediately
      fetchJobs(coords.lat, coords.lng, selectedCategory);
    } else if (coords && selectedCategory !== 'all') {
      // fetchJobs(coords.lat, coords.lng, selectedCategory);
    }
  }, [coords, selectedCategory]);

  // 3. Notification System (Simulation)
  useEffect(() => {
    // Only run simulation if we are on home view and have coords
    if (currentView !== 'home' || !coords || loadingJobs) return;

    const intervalId = setInterval(() => {
      // 1. Determine Category
      let jobCategory = selectedCategory;
      if (jobCategory === 'all') {
        const availableCats = CATEGORIES.filter(c => c.id !== 'all');
        jobCategory = availableCats[Math.floor(Math.random() * availableCats.length)].id;
      }

      // 2. Generate Mock Job Data
      const titles = MOCK_TITLES[jobCategory] || MOCK_TITLES.default;
      const randomTitle = titles[Math.floor(Math.random() * titles.length)];
      const randomPrice = Math.floor(Math.random() * 100) + 20;
      const randomDist = Number((Math.random() * 10).toFixed(1));
      
      const availabilities = ['Immédiat', 'Week-end', 'Soirée', 'Semaine'];
      const randomAvail = availabilities[Math.floor(Math.random() * availabilities.length)];

      const newJob = {
        id: `mock-${Date.now()}`,
        title: randomTitle,
        description: "Nouvelle offre ajoutée à l'instant. Besoin rapide !",
        price: `${randomPrice}€`,
        numericPrice: randomPrice,
        location: locationName.split(',')[0] || "Quartier voisin",
        distance: `${randomDist} km`,
        numericDistance: randomDist,
        postedTime: "À l'instant",
        category: jobCategory,
        availability: randomAvail,
        contactEmail: `client-${Math.floor(Math.random() * 1000)}@email.com`,
        isPremium: Math.random() > 0.8, // 20% chance
        tags: []
      };

      // 3. Check if matches CURRENT user filters
      const matchesPrice = newJob.numericPrice <= filterMaxPrice;
      const matchesDistance = newJob.numericDistance <= filterMaxDistance;
      const matchesAvailability = filterAvailability === 'all' || newJob.availability === filterAvailability;
      
      const matchesDate = true; 

      if (matchesPrice && matchesDistance && matchesAvailability && matchesDate) {
        setJobs(prev => [newJob, ...prev]);
        
        // Trigger Notification if Enabled
        if (notificationsEnabled) {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("🔔 Nouvelle offre Je Gjobe !", {
              body: `${newJob.title}\n${newJob.price} - ${newJob.distance} de votre position.`
            });
          } else {
             alert(`🔔 Nouvelle offre détectée pour vous !\n\n${newJob.title}\n${newJob.category} - ${newJob.price}\nÀ ${newJob.distance} de votre position.`);
          }
        }
      }

    }, 30000); // Check every 30 seconds

    return () => clearInterval(intervalId);
  }, [selectedCategory, filterMaxPrice, filterMaxDistance, filterAvailability, filterDate, currentView, coords, locationName, loadingJobs, notificationsEnabled]);


  // --- API Functions ---

  const reverseGeocode = async (lat, lng) => {
    const basePrompt = `Identify the city and country for these coordinates: ${lat}, ${lng}. Return ONLY the city and country name in French (e.g., "Lyon, France"). Do not add any other text.`;

    try {
      // Gemini
      if (AI_PROVIDER === 'gemini' && geminiClient) {
        const response = await geminiClient.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: basePrompt
        });
        const text = typeof response.text === 'function' ? response.text() : response.text;
        setLocationName((text || '').trim());
        return;
      }

      // OpenAI
      if (AI_PROVIDER === 'openai' && OPENAI_API_KEY) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: OPENAI_MODEL,
            temperature: 0.2,
            messages: [
              {
                role: 'system',
                content:
                  "Tu es un service de géocodage. Tu réponds uniquement par \"Ville, Pays\" en français, sans texte supplémentaire."
              },
              { role: 'user', content: basePrompt }
            ]
          })
        });
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content || '';
        setLocationName(content.trim());
        return;
      }

      // Groq (API OpenAI-compatible)
      if (AI_PROVIDER === 'groq' && GROQ_API_KEY) {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${GROQ_API_KEY}`
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            temperature: 0.2,
            messages: [
              {
                role: 'system',
                content:
                  "Tu es un service de géocodage. Tu réponds uniquement par \"Ville, Pays\" en français, sans texte supplémentaire."
              },
              { role: 'user', content: basePrompt }
            ]
          })
        });
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content || '';
        setLocationName(content.trim());
        return;
      }

      // Fallback
      setLocationName("Votre position");
    } catch (e) {
      console.error("Geocoding failed", e);
      setLocationName("Votre position");
    }
  };

  const fetchJobs = async (lat, lng, category) => {
    setLoadingJobs(true);
    try {
      const categoryLabel = CATEGORIES.find(c => c.id === category)?.label || "Services divers";
      const profileContext = `
        Profil jobber:
        - Métier principal: ${profile.jobTitle || 'Non renseigné'}
        - Compétences: ${(profile.skills && profile.skills.length > 0) ? profile.skills.join(', ') : 'Non renseigné'}
        - Zone / ville préférée: ${profile.locationPreference || 'Basée sur la géolocalisation actuelle'}
        - Disponibilités: ${profile.availability || 'Non renseigné'}
      `;

      const prompt = `
        Génère 6 annonces de jobs pour une app style AlloVoisins.
        Catégorie: ${category === 'all' ? 'Divers (Plombier, Ménage, etc.)' : categoryLabel}.
        Lieu: Lat ${lat}, Lng ${lng}. Rayon < 30km.
        Langue: Français.
        Certaines annonces doivent être marquées comme premium (isPremium = true).
        
        Les annonces doivent être prioritairement pertinentes pour ce profil jobber:
        ${profileContext}

        Si des informations de profil ne sont pas renseignées, génère des annonces générales mais réalistes.

        JSON uniquement, tableau d'objets:
        {
          "id": "uuid",
          "title": "Titre",
          "description": "Courte description",
          "price": "20€",
          "numericPrice": 20,
          "location": "Ville",
          "distance": "2.5 km",
          "numericDistance": 2.5,
          "postedTime": "Il y a 2h",
          "category": "Catégorie",
          "availability": "Semaine",
          "contactEmail": "email@example.com",
          "isPremium": false
        }
      `;
      let data = [];

      try {
        // Gemini avec schéma JSON typé
        if (AI_PROVIDER === 'gemini' && geminiClient) {
          const response = await geminiClient.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    price: { type: Type.STRING },
                    numericPrice: { type: Type.NUMBER },
                    location: { type: Type.STRING },
                    distance: { type: Type.STRING },
                    numericDistance: { type: Type.NUMBER },
                    postedTime: { type: Type.STRING },
                    category: { type: Type.STRING },
                    availability: { type: Type.STRING },
                    contactEmail: { type: Type.STRING },
                    isPremium: { type: Type.BOOLEAN }
                  }
                }
              }
            }
          });
          const text = typeof response.text === 'function' ? response.text() : response.text;
          if (text) {
            data = JSON.parse(text);
          }
        } else if (AI_PROVIDER === 'openai' && OPENAI_API_KEY) {
          // OpenAI – on demande explicitement du JSON
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              model: OPENAI_MODEL,
              temperature: 0.4,
              messages: [
                {
                  role: 'system',
                  content:
                    "Tu es un générateur d'annonces pour une application type AlloVoisins. Tu réponds STRICTEMENT en JSON valide, sans texte autour."
                },
                { role: 'user', content: prompt }
              ]
            })
          });
          const json = await res.json();
          const content = json?.choices?.[0]?.message?.content || '';
          if (content) {
            data = JSON.parse(content);
          }
        } else if (AI_PROVIDER === 'groq' && GROQ_API_KEY) {
          // Groq – API OpenAI-compatible
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
              model: GROQ_MODEL,
              temperature: 0.4,
              messages: [
                {
                  role: 'system',
                  content:
                    "Tu es un générateur d'annonces pour une application type AlloVoisins. Tu réponds STRICTEMENT en JSON valide, sans texte autour."
                },
                { role: 'user', content: prompt }
              ]
            })
          });
          const json = await res.json();
          const content = json?.choices?.[0]?.message?.content || '';
          if (content) {
            data = JSON.parse(content);
          }
        }
      } catch (parseErr) {
        console.warn("API response was not valid JSON or cut off, falling back to mock data.", parseErr);
        throw parseErr;
      }

      if (!Array.isArray(data)) throw new Error("Response is not an array");
      setJobs(prev => [...data, ...prev]); 
    } catch (error) {
      console.warn("Job generation failed or incomplete, using fallback data.");
      const fallbackJobs = Array.from({ length: 6 }).map((_, i) => {
        let catKey = category;
        if (catKey === 'all') {
             const keys = CATEGORIES.map(c => c.id).filter(id => id !== 'all');
             catKey = keys[Math.floor(Math.random() * keys.length)];
        }
        
        const titles = MOCK_TITLES[catKey] || MOCK_TITLES.default;
        const randomTitle = titles[Math.floor(Math.random() * titles.length)];
        const categoryObj = CATEGORIES.find(c => c.id === catKey);
        
        return {
          id: `fallback-${Date.now()}-${i}`,
          title: randomTitle,
          description: "Annonce (Mode hors ligne). La description détaillée n'a pas pu être chargée.",
          price: `${20 + i * 5}€`,
          numericPrice: 20 + i * 5,
          location: locationName.split(',')[0] || "Quartier",
          distance: `${(i + 1) * 1.5} km`,
          numericDistance: (i + 1) * 1.5,
          postedTime: "Il y a 1h",
          category: categoryObj ? categoryObj.label : "Autre",
          availability: "Semaine",
          contactEmail: `client-${Date.now()}-${i}@email.com`,
          isPremium: Math.random() > 0.8,
          tags: []
        };
      });
      setJobs(prev => [...fallbackJobs, ...prev]);
    } finally {
      setLoadingJobs(false);
    }
  };

  const handleApply = (e, jobId) => {
    e.stopPropagation();
    setConfirmingJobId(jobId);
  };

  const handleCancelApplication = (e, jobId) => {
    e.stopPropagation();
    setCancelingJobId(jobId);
  };

  const confirmApply = () => {
    if (confirmingJobId) {
      setAppliedJobs(prev => {
        const next = new Set(prev);
        next.add(confirmingJobId);
        return next;
      });
      
      const job = jobs.find(j => j.id === confirmingJobId);
      if (job) {
        setAppliedJobHistory(prev => [...prev, job]);
      }

      setConfirmingJobId(null);
    }
  };

  const confirmCancel = () => {
    if (cancelingJobId) {
      setAppliedJobs(prev => {
        const next = new Set(prev);
        next.delete(cancelingJobId);
        return next;
      });

      setAppliedJobHistory(prev => prev.filter(job => job.id !== cancelingJobId));
      setCancelingJobId(null);
    }
  };

  const handleCompleteMission = (jobId, jobTitle) => {
    setCompletedJobIds(prev => {
        const next = new Set(prev);
        next.add(jobId);
        return next;
    });

    const randomComment = MOCK_REVIEWS_COMMENTS[Math.floor(Math.random() * MOCK_REVIEWS_COMMENTS.length)];
    const randomClient = MOCK_CLIENT_NAMES[Math.floor(Math.random() * MOCK_CLIENT_NAMES.length)];
    const randomRating = Math.random() > 0.3 ? 5 : 4; 

    const newReview = {
        id: `review-${Date.now()}`,
        clientName: randomClient,
        rating: randomRating,
        comment: randomComment,
        date: new Date().toLocaleDateString('fr-FR'),
        jobTitle: jobTitle
    };

    setProfile(prev => ({
        ...prev,
        reviews: [newReview, ...prev.reviews],
        completedMissions: prev.completedMissions + 1
    }));
    
    alert(`👏 Mission terminée !\n\n${randomClient} vous a laissé un avis ${randomRating} étoiles :\n"${randomComment}"`);
  };

  const handlePaymentSuccess = () => {
    setProfile(prev => ({ ...prev, isPremium: true }));
    setShowPaymentModal(false);
  };

  const handleContact = (e, job) => {
    e.stopPropagation();
    alert(`📧 Contact de l'annonceur :\n\n${job.contactEmail || 'Veuillez utiliser le chat pour contacter cet utilisateur.'}`);
  };

  const handleViewProfile = (e, job) => {
    e.stopPropagation();
    
    const mockProfile = {
        name: MOCK_CLIENT_NAMES[Math.floor(Math.random() * MOCK_CLIENT_NAMES.length)],
        email: job.contactEmail || 'contact@example.com',
        skills: [job.category, 'Bricolage', 'Jardinage'], 
        bio: `Bonjour, je suis un voisin passionné par le service. Je propose régulièrement des annonces dans la catégorie ${job.category} sur ${job.location}. N'hésitez pas à me contacter !`,
        isCreated: true,
        isPremium: job.isPremium || false,
        reviews: [],
        completedMissions: Math.floor(Math.random() * 50) + 5
    };

    const numReviews = Math.floor(Math.random() * 6) + 2; 
    for(let i=0; i<numReviews; i++) {
        mockProfile.reviews.push({
             id: `mock-review-${Date.now()}-${i}`,
             clientName: MOCK_CLIENT_NAMES[Math.floor(Math.random() * MOCK_CLIENT_NAMES.length)],
             rating: Math.random() > 0.2 ? 5 : 4,
             comment: MOCK_REVIEWS_COMMENTS[Math.floor(Math.random() * MOCK_REVIEWS_COMMENTS.length)],
             date: `Il y a ${Math.floor(Math.random() * 10) + 1} mois`,
             jobTitle: i % 2 === 0 ? job.category : 'Service divers'
        });
    }

    setSelectedPublicProfile(mockProfile);
    handleNavigate('public_profile');
  };

  const handleCreateJob = (jobData) => {
    const newJob = {
        id: `local-${Date.now()}`,
        title: jobData.title,
        description: jobData.description,
        price: `${jobData.price}€`,
        numericPrice: parseFloat(jobData.price),
        location: jobData.location,
        distance: "0.1 km", 
        numericDistance: 0.1,
        postedTime: "À l'instant",
        category: jobData.category,
        availability: jobData.availability,
        contactEmail: profile.email || "contact@jobber.com",
        isPremium: false, 
        tags: jobData.tags || []
    };
    
    setJobs(prev => [newJob, ...prev]);
    alert("Votre annonce a été publiée avec succès !");
    handleHomeClick();
  };

  // --- UI Components ---

  const PaymentModal = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleTelegramPayment = () => {
      setError('');
      const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
      if (!tg) {
        alert("Ouvrez Je Gjobe depuis Telegram pour payer via Telegram.");
        return;
      }
      if (!TELEGRAM_PREMIUM_INVOICE_SLUG) {
        alert("Le paiement Telegram n'est pas encore configuré côté bot.");
        return;
      }
      try {
        setIsLoading(true);
        tg.sendData(JSON.stringify({ action: 'premium_subscribe' }));
        alert("Demande d'abonnement envoyée au bot Telegram. Vous recevrez une facture dans la conversation.");
        // Pour la démo front, on active directement le mode Premium.
        handlePaymentSuccess();
      } catch (e) {
        console.error('Telegram payment error', e);
        setError("Le paiement Telegram a échoué ou a été annulé.");
      } finally {
        setIsLoading(false);
      }
    };

    const handleDjamoPayment = () => {
      setError('');
      if (!DJAMO_PAYMENT_URL) {
        alert("Le paiement Djamo n'est pas encore configuré.");
        return;
      }
      window.open(DJAMO_PAYMENT_URL, '_blank');
      // Activation immédiate côté front (démo)
      handlePaymentSuccess();
    };

    const handleWavePayment = () => {
      setError('');
      if (!WAVE_QR_URL) {
        alert("Le QR code Wave n'est pas encore configuré.");
        return;
      }
      window.open(WAVE_QR_URL, '_blank');
      // Activation immédiate côté front (démo)
      handlePaymentSuccess();
    };

    if (!showPaymentModal) return null;

    return (
      <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-0 max-w-md w-full overflow-hidden border border-gray-100 dark:border-gray-700">
           <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-6 text-white relative">
              <button 
                 onClick={() => setShowPaymentModal(false)}
                 className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
              <div className="flex items-center gap-3 mb-2">
                 <Crown size={32} fill="white" className="text-white" />
                 <h2 className="text-2xl font-bold">Je Gjobe Premium</h2>
              </div>
              <p className="text-orange-100 text-sm">Boostez votre visibilité et décrochez plus de missions !</p>
           </div>
           
           <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                 <div>
                    <span className="text-gray-500 dark:text-gray-400 text-sm">Total à payer</span>
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">2 000 XOF<span className="text-sm font-normal text-gray-500 dark:text-gray-400"> / mois</span></div>
                 </div>
                 <div className="flex gap-2">
                   <div className="bg-gray-100 dark:bg-gray-700 p-2 rounded w-10 h-6"></div>
                   <div className="bg-gray-100 dark:bg-gray-700 p-2 rounded w-10 h-6"></div>
                 </div>
              </div>

              <div className="space-y-4">
                 {error && <p className="text-red-500 text-sm">{error}</p>}

                 <button 
                    type="button"
                    disabled={isLoading}
                    onClick={handleTelegramPayment}
                    className="w-full bg-sky-500 hover:bg-sky-600 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
                 >
                    {isLoading ? <Loader2 className="animate-spin" size={20} /> : "Payer via Telegram"}
                 </button>
                 
                 <button 
                    type="button"
                    onClick={handleDjamoPayment}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                 >
                    <CreditCard size={20} />
                    <span>Payer avec Djamo (Mobile Money XOF)</span>
                 </button>

                 <button 
                    type="button"
                    onClick={handleWavePayment}
                    className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                 >
                    <Euro size={20} />
                    <span>Payer avec Wave (scanner le QR code)</span>
                 </button>

                 <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-4">
                   Le paiement est traité via Telegram, Djamo ou Wave. Votre statut Premium sera mis à jour après confirmation côté serveur.
                 </p>
              </div>
           </div>
        </div>
      </div>
    );
  };

  const ConfirmationModal = () => {
    if (!confirmingJobId) return null;

    return (
      <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setConfirmingJobId(null)}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full transform transition-all scale-100 border dark:border-gray-700" onClick={e => e.stopPropagation()}>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Confirmer la candidature</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">Êtes-vous sûr de vouloir postuler à cette offre ?</p>
          <div className="flex gap-3">
            <button 
              onClick={() => setConfirmingJobId(null)}
              className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Annuler
            </button>
            <button 
              onClick={confirmApply}
              className="flex-1 px-4 py-2.5 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200 dark:shadow-none"
            >
              Confirmer
            </button>
          </div>
        </div>
      </div>
    );
  };

  const CancelConfirmationModal = () => {
    if (!cancelingJobId) return null;

    return (
      <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setCancelingJobId(null)}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full transform transition-all scale-100 border dark:border-gray-700" onClick={e => e.stopPropagation()}>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Annuler la candidature</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">Êtes-vous sûr de vouloir annuler votre candidature à cette offre ?</p>
          <div className="flex gap-3">
            <button 
              onClick={() => setCancelingJobId(null)}
              className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Annuler
            </button>
            <button 
              onClick={confirmCancel}
              className="flex-1 px-4 py-2.5 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-colors shadow-lg shadow-red-200 dark:shadow-none"
            >
              Confirmer
            </button>
          </div>
        </div>
      </div>
    );
  };

  const Navbar = () => {
    return (
      <nav className="bg-white dark:bg-gray-800 shadow-sm fixed top-0 w-full z-50 border-b dark:border-gray-700 transition-colors duration-300">
        <div className="max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            {viewHistory.length > 0 && (
               <button 
                  onClick={handleBack}
                  className="mr-2 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                  aria-label="Retour"
               >
                 <ArrowLeft size={20} />
               </button>
            )}
            <div className="flex items-center gap-2 cursor-pointer" onClick={handleHomeClick}>
              <div className="bg-orange-500 text-white p-1.5 rounded-lg">
                <Briefcase size={24} />
              </div>
              <span className="font-bold text-xl text-gray-800 dark:text-white">Je Gjobe</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            
            <button 
               onClick={() => handleNavigate('create_job')}
               className="hidden sm:flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-full font-medium transition-colors shadow-sm"
            >
               <PlusCircle size={18} />
               <span>Publier</span>
            </button>

             <button
              onClick={toggleTheme}
              className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Toggle Theme"
             >
               {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
             </button>

            <button 
               onClick={() => handleNavigate('create_job')}
               className="sm:hidden p-2 text-orange-500 hover:bg-orange-50 dark:hover:bg-gray-700 rounded-full"
            >
              <PlusCircle size={24} />
            </button>

            <button 
               onClick={() => handleNavigate('about')}
               className={`flex items-center gap-1 text-sm font-medium transition-colors ${currentView === 'about' ? 'text-orange-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
            >
               <Info size={18} />
               <span className="hidden sm:inline">À propos</span>
            </button>

            <button 
               onClick={() => handleNavigate('profile')}
               className={`flex items-center gap-1 text-sm font-medium transition-colors ${currentView === 'profile' ? 'text-orange-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
            >
               <Check size={18} />
               <span className="hidden sm:inline">Mes Candidatures ({appliedJobs.size})</span>
               <span className="sm:hidden">({appliedJobs.size})</span>
            </button>

            <button 
              onClick={() => handleNavigate('profile')}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 relative text-gray-600 dark:text-gray-300 overflow-hidden flex items-center gap-1"
            >
              {profile.isCreated && profile.profilePicture ? (
                <img src={profile.profilePicture} alt="Profile" className="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-gray-600" />
              ) : (
                <User size={24} />
              )}
              {profile.isPremium && (
                <Crown size={16} className="text-amber-500 absolute -top-1 -right-1 fill-amber-500 bg-white dark:bg-gray-800 rounded-full" />
              )}
              {profile.isCreated && !profile.profilePicture && !profile.isPremium && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white dark:border-gray-800"></span>
              )}
            </button>
          </div>
        </div>
      </nav>
    );
  };

  const CreateJobView = () => {
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState(CATEGORIES[1].id); // Default to menage
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [location, setLocation] = useState(locationName.includes("Non supporté") ? "" : locationName.split(',')[0]);
    const [availability, setAvailability] = useState(AVAILABILITY_OPTIONS[1].id);
    const [tags, setTags] = useState([]);
    const [currentTag, setCurrentTag] = useState('');
    // Remove explicit Record type to avoid comma in generic type syntax issues in parsing
    const [errors, setErrors] = useState<any>({});

    const handleAddTag = () => {
        const trimmed = currentTag.trim();
        if (trimmed && !tags.includes(trimmed)) {
            setTags([...tags, trimmed]);
            setCurrentTag('');
        }
    };

    const handleRemoveTag = (tagToRemove) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddTag();
        }
    };

    const handleSubmit = () => {
        const newErrors: any = {};
        if (!title.trim()) newErrors.title = "Le titre est requis";
        if (!description.trim()) newErrors.description = "La description est requise";
        if (!price || isNaN(Number(price))) newErrors.price = "Prix valide requis";
        if (!location.trim()) newErrors.location = "La localisation est requise";

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        handleCreateJob({
            title,
            category,
            description,
            price,
            location,
            availability,
            tags
        });
    };

    return (
        <div className="max-w-2xl mx-auto px-4 py-8 pb-20">
            <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white flex items-center gap-2">
               <PlusCircle className="text-orange-500" />
               Publier une annonce
            </h2>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-5">
                
                {/* Title */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Titre de l'annonce</label>
                    <input 
                        type="text" 
                        placeholder="Ex: Cherche plombier pour fuite d'eau"
                        className={`w-full p-3 border rounded-xl outline-none focus:border-orange-500 dark:bg-gray-700 dark:text-white ${errors.title ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'}`}
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                    />
                    {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
                </div>

                {/* Category */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Catégorie</label>
                    <div className="flex flex-wrap gap-2">
                        {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setCategory(cat.id)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                                    category === cat.id 
                                    ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-500 text-orange-600 dark:text-orange-400' 
                                    : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                            >
                                {cat.icon}
                                <span>{cat.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description détaillée</label>
                    <textarea 
                        placeholder="Décrivez votre besoin en détail..."
                        className={`w-full p-3 border rounded-xl outline-none focus:border-orange-500 h-32 resize-none dark:bg-gray-700 dark:text-white ${errors.description ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'}`}
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                    />
                    {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Price */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Budget estimé (€)</label>
                        <div className="relative">
                            <Euro size={18} className="absolute left-3 top-3.5 text-gray-400" />
                            <input 
                                type="number" 
                                placeholder="Ex: 50"
                                className={`w-full pl-10 p-3 border rounded-xl outline-none focus:border-orange-500 dark:bg-gray-700 dark:text-white ${errors.price ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'}`}
                                value={price}
                                onChange={e => setPrice(e.target.value)}
                            />
                        </div>
                        {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price}</p>}
                    </div>

                    {/* Location */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ville / Quartier</label>
                        <div className="relative">
                            <MapPin size={18} className="absolute left-3 top-3.5 text-gray-400" />
                            <input 
                                type="text" 
                                placeholder="Ex: Paris 11ème"
                                className={`w-full pl-10 p-3 border rounded-xl outline-none focus:border-orange-500 dark:bg-gray-700 dark:text-white ${errors.location ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'}`}
                                value={location}
                                onChange={e => setLocation(e.target.value)}
                            />
                        </div>
                        {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location}</p>}
                    </div>
                </div>

                {/* Tags */}
                <div>
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mots-clés / Tags</label>
                   <div className="flex gap-2 mb-2">
                       <input 
                           type="text" 
                           placeholder="Ex: Urgent, Matériel fourni..."
                           className="flex-1 p-3 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:border-orange-500 dark:bg-gray-700 dark:text-white"
                           value={currentTag}
                           onChange={e => setCurrentTag(e.target.value)}
                           onKeyDown={handleKeyDown}
                       />
                       <button 
                         onClick={handleAddTag}
                         className="px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                       >
                         <PlusCircle size={20} />
                       </button>
                   </div>
                   <div className="flex flex-wrap gap-2">
                      {tags.map((tag, idx) => (
                          <span key={idx} className="flex items-center gap-1 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded-lg text-sm border border-blue-100 dark:border-blue-800">
                             #{tag}
                             <button onClick={() => handleRemoveTag(tag)} className="hover:text-blue-800 dark:hover:text-blue-100"><X size={14} /></button>
                          </span>
                      ))}
                   </div>
                </div>

                {/* Availability */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Disponibilité souhaitée</label>
                    <div className="flex flex-wrap gap-2">
                        {AVAILABILITY_OPTIONS.filter(opt => opt.id !== 'all').map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => setAvailability(opt.id)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                                    availability === opt.id
                                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                    <button 
                        onClick={handleHomeClick}
                        className="flex-1 py-3 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                        Annuler
                    </button>
                    <button 
                        onClick={handleSubmit}
                        className="flex-1 py-3 px-4 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200 dark:shadow-none flex items-center justify-center gap-2"
                    >
                        <Check size={20} />
                        Publier l'annonce
                    </button>
                </div>

            </div>
        </div>
    );
  };

  const LocationHeader = () => (
    <div className="bg-white dark:bg-gray-800 pt-4 pb-2 px-4 sticky top-[60px] z-40 shadow-sm transition-colors duration-300">
      <div className="flex justify-between items-center max-w-4xl mx-auto">
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
          <MapPin size={18} className="text-orange-500" />
          <span className="font-medium truncate max-w-[200px] sm:max-w-md">
            {loadingLocation ? "Localisation..." : locationName}
          </span>
        </div>
        <button 
          onClick={() => setShowFilters(!showFilters)}
          className={`p-2 rounded-lg transition-colors ${showFilters ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
        >
          <SlidersHorizontal size={20} />
        </button>
      </div>

      {showFilters && (
        <div className="max-w-4xl mx-auto mt-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-700 animate-in fade-in slide-in-from-top-2">
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                 <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2 block">Prix maximum: {filterMaxPrice}€</label>
                 <input 
                   type="range" 
                   min="10" 
                   max="500" 
                   step="10" 
                   value={filterMaxPrice}
                   onChange={(e) => setFilterMaxPrice(Number(e.target.value))}
                   className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-orange-500"
                 />
              </div>
              <div>
                 <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2 block">Distance max: {filterMaxDistance} km</label>
                 <input 
                   type="range" 
                   min="1" 
                   max="100" 
                   step="1" 
                   value={filterMaxDistance}
                   onChange={(e) => setFilterMaxDistance(Number(e.target.value))}
                   className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-orange-500"
                 />
              </div>
              <div>
                 <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2 block">Disponibilité</label>
                 <select 
                   value={filterAvailability}
                   onChange={(e) => setFilterAvailability(e.target.value)}
                   className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none focus:border-orange-500 dark:text-white"
                 >
                    {AVAILABILITY_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                 </select>
              </div>
               <div>
                 <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2 block">Date de publication</label>
                 <select 
                   value={filterDate}
                   onChange={(e) => setFilterDate(e.target.value)}
                   className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none focus:border-orange-500 dark:text-white"
                 >
                    {DATE_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                 </select>
              </div>
           </div>
        </div>
      )}
    </div>
  );

  const CategoryFilter = () => (
    <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 py-3 sticky top-[108px] z-30 transition-colors duration-300">
      <div className="max-w-4xl mx-auto px-4 overflow-x-auto no-scrollbar">
        <div className="flex gap-3 pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all duration-200 font-medium text-sm ${
                selectedCategory === cat.id
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-200 dark:shadow-none'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {cat.icon}
              {cat.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const JobList = () => {
      // Sorting & Filtering Logic
    const displayJobs = jobs.filter(job => {
      // Filter by Price
      if (job.numericPrice > filterMaxPrice) return false;
      // Filter by Distance
      if (job.numericDistance > filterMaxDistance) return false;
      // Filter by Availability
      if (filterAvailability !== 'all' && job.availability !== filterAvailability) return false;
      
      // Filter by Date
      if (filterDate !== 'all') {
         const lowerTime = job.postedTime.toLowerCase();
         // Basic string parsing heuristic for "postedTime" (e.g., "Il y a 2h", "Il y a 1 jour")
         
         const isToday = lowerTime.includes('instant') || lowerTime.includes('min') || lowerTime.includes('h') || lowerTime.includes('sec');
         if (filterDate === 'today' && !isToday) return false;

         const isWeek = isToday || lowerTime.includes('jour') || lowerTime.includes('hier');
         if (filterDate === 'week' && !isWeek) return false;

         const isMonth = isWeek || lowerTime.includes('semaine');
         if (filterDate === 'month' && !isMonth) return false;
      }
      
      // Filter by Tags
      if (filterTag && (!job.tags || !job.tags.includes(filterTag))) return false;

      return true;
    });
    
    if (sortBy === 'distance') {
      displayJobs.sort((a, b) => a.numericDistance - b.numericDistance);
    } else if (sortBy === 'price_asc') {
      displayJobs.sort((a, b) => a.numericPrice - b.numericPrice);
    } else if (sortBy === 'price_desc') {
      displayJobs.sort((a, b) => b.numericPrice - a.numericPrice);
    }

    return (
    <div className="max-w-4xl mx-auto p-4 pb-20 space-y-4">
      {loadingJobs && jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="animate-spin mb-4 text-orange-500" size={32} />
          <p>Recherche des meilleures missions...</p>
        </div>
      ) : displayJobs.length === 0 ? (
        <div className="text-center py-20 text-gray-500 dark:text-gray-400">
          <Search size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-lg">Aucune offre trouvée pour ces critères.</p>
          <button 
             onClick={() => {
               setFilterMaxPrice(500);
               setFilterMaxDistance(100);
               setSelectedCategory('all');
               setFilterTag(null);
               setFilterAvailability('all');
               setFilterDate('all');
             }}
             className="mt-4 text-orange-500 font-medium hover:underline"
          >
            Réinitialiser les filtres
          </button>
        </div>
      ) : (
        displayJobs.map((job) => (
          <div key={job.id} className={`bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all duration-300 group ${job.isPremium ? 'ring-2 ring-amber-400 dark:ring-amber-500/50' : ''}`}>
             
             {job.isPremium && (
               <div className="flex items-center gap-1 text-amber-500 text-xs font-bold uppercase tracking-wider mb-2">
                 <Crown size={12} fill="currentColor" />
                 Sponsorisé
               </div>
             )}

             <div className="flex justify-between items-start mb-1">
               <div>
                 <h3 className="font-bold text-lg text-gray-900 dark:text-white group-hover:text-orange-500 transition-colors">{job.title}</h3>
                 
                 {job.tags && job.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 mb-1">
                    {job.tags.map((tag, idx) => (
                        <span 
                        key={idx}
                        onClick={(e) => {
                            e.stopPropagation();
                            setFilterTag(prev => prev === tag ? null : tag);
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded-full cursor-pointer transition-colors border ${
                            filterTag === tag 
                            ? 'bg-orange-500 text-white border-orange-500' 
                            : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-600 hover:border-orange-300 dark:hover:border-gray-500'
                        }`}
                        >
                        #{tag}
                        </span>
                    ))}
                    </div>
                 )}

                 <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mt-1">
                    <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs font-medium">{job.category}</span>
                    <span>•</span>
                    <span>{job.postedTime}</span>
                 </div>
               </div>
               <div className="text-right">
                 <div className="font-bold text-xl text-gray-900 dark:text-white">{job.price}</div>
                 <div className="text-xs text-gray-400 dark:text-gray-500">{job.availability}</div>
               </div>
             </div>
             
             <p className="text-gray-600 dark:text-gray-300 text-sm mb-4 line-clamp-2">{job.description}</p>
             
             <div className="flex items-center justify-between pt-4 border-t border-gray-50 dark:border-gray-700/50">
                <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                   <div className="flex items-center gap-1">
                      <MapPin size={14} />
                      {job.distance}
                   </div>
                   <button onClick={(e) => handleViewProfile(e, job)} className="flex items-center gap-1 hover:text-orange-500 transition-colors">
                      <User size={14} />
                      Voir profil
                   </button>
                </div>
                
                <div className="flex gap-2">
                   {appliedJobs.has(job.id) ? (
                     <button 
                       onClick={(e) => handleCancelApplication(e, job.id)}
                       className="px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 font-medium rounded-xl text-sm flex items-center gap-1 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors group/btn"
                     >
                       <span className="group-hover/btn:hidden flex items-center gap-1"><Check size={16} /> Postulé</span>
                       <span className="hidden group-hover/btn:inline">Annuler</span>
                     </button>
                   ) : (
                     <div className="flex gap-2">
                        <button 
                          onClick={(e) => handleContact(e, job)}
                          className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                          <MessageSquareQuote size={18} />
                        </button>
                        <button 
                          onClick={(e) => handleApply(e, job.id)}
                          className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium rounded-xl text-sm hover:bg-orange-500 dark:hover:bg-gray-200 transition-colors"
                        >
                          Postuler
                        </button>
                     </div>
                   )}
                </div>
             </div>
          </div>
        ))
      )}
    </div>
  );
  };

  const ProfileView = () => {
    const [skillInput, setSkillInput] = useState('');

    const handleProfileFieldChange = (field, value) => {
      setProfile(prev => ({ ...prev, [field]: value, isCreated: true }));
    };

    const handleAddSkill = () => {
      const trimmed = skillInput.trim();
      if (!trimmed) return;
      setProfile(prev => ({
        ...prev,
        isCreated: true,
        skills: prev.skills.includes(trimmed) ? prev.skills : [...prev.skills, trimmed]
      }));
      setSkillInput('');
    };

    const handleRemoveSkill = (skill) => {
      setProfile(prev => ({
        ...prev,
        skills: prev.skills.filter(s => s !== skill)
      }));
    };

    const handleSkillInputKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddSkill();
      }
    };

    return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-20">
      {/* Profile Header */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 mb-6 text-center relative overflow-hidden">
        
        {profile.isPremium && (
          <div className="absolute top-0 right-0 bg-gradient-to-bl from-amber-400 to-orange-500 text-white px-4 py-1 rounded-bl-2xl font-bold text-xs flex items-center gap-1 shadow-lg">
             <Crown size={12} fill="white" /> PREMIUM
          </div>
        )}

        <div className="relative inline-block mb-4">
           {profile.profilePicture ? (
             <img src={profile.profilePicture} alt="Profile" className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-gray-700 shadow-lg" />
           ) : (
             <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center border-4 border-white dark:border-gray-700 shadow-lg mx-auto text-gray-400">
               <User size={40} />
             </div>
           )}
           <button className="absolute bottom-0 right-0 bg-orange-500 text-white p-2 rounded-full hover:bg-orange-600 transition-colors shadow-md">
             <Camera size={14} />
           </button>
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{profile.name || "Utilisateur"}</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">{profile.email || "email@example.com"}</p>
        {profile.jobTitle && (
          <p className="text-gray-600 dark:text-gray-300 text-sm mb-2">{profile.jobTitle}</p>
        )}
        
        <div className="flex justify-center gap-2 mb-6 flex-wrap">
          {profile.skills.length > 0 ? (
            profile.skills.map((skill, i) => (
              <span key={i} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-xs font-medium">
                {skill}
              </span>
            ))
          ) : (
            <span className="text-gray-400 text-sm italic">Aucune compétence ajoutée</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 border-t dark:border-gray-700 pt-4">
           <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{profile.completedMissions}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Missions</div>
           </div>
           <div className="text-center border-l dark:border-gray-700">
              <div className="text-2xl font-bold text-gray-900 dark:text-white flex items-center justify-center gap-1">
                4.8 <Star size={16} className="text-amber-400 fill-amber-400" />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Avis ({profile.reviews.length})</div>
           </div>
        </div>

        {!profile.isPremium && (
          <button 
             onClick={() => setShowPaymentModal(true)}
             className="mt-6 w-full py-3 bg-gradient-to-r from-gray-900 to-gray-800 dark:from-white dark:to-gray-100 text-white dark:text-gray-900 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
          >
             <Crown size={18} className="text-amber-400 dark:text-amber-500 fill-amber-400 dark:fill-amber-500" />
             Passer Premium (2 000 XOF / mois)
          </button>
        )}
      </div>

      {/* Profile Form */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Informations du profil</h3>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">Nom complet</label>
              <input
                type="text"
                className="w-full p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-orange-500 dark:focus:border-orange-500 dark:text-white"
                value={profile.name}
                onChange={e => handleProfileFieldChange('name', e.target.value)}
                placeholder="Ex : Jean Dupont"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">Email</label>
              <input
                type="email"
                className="w-full p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-orange-500 dark:focus:border-orange-500 dark:text-white"
                value={profile.email}
                onChange={e => handleProfileFieldChange('email', e.target.value)}
                placeholder="email@example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">Métier / rôle principal</label>
              <input
                type="text"
                className="w-full p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-orange-500 dark:focus:border-orange-500 dark:text-white"
                value={profile.jobTitle || ''}
                onChange={e => handleProfileFieldChange('jobTitle', e.target.value)}
                placeholder="Ex : Plombier, Baby-sitter, Ménage..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">Zone / ville préférée</label>
              <input
                type="text"
                className="w-full p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-orange-500 dark:focus:border-orange-500 dark:text-white"
                value={profile.locationPreference || ''}
                onChange={e => handleProfileFieldChange('locationPreference', e.target.value)}
                placeholder="Ex : Cocody, Yopougon..."
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">Disponibilités</label>
            <input
              type="text"
              className="w-full p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-orange-500 dark:focus:border-orange-500 dark:text-white"
              value={profile.availability || ''}
              onChange={e => handleProfileFieldChange('availability', e.target.value)}
              placeholder="Ex : Soir et week-end, tous les jours..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">Compétences</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {profile.skills.length > 0 ? (
                profile.skills.map((skill, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-full text-xs flex items-center gap-1 hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    <span>{skill}</span>
                    <X size={12} />
                  </button>
                ))
              ) : (
                <span className="text-gray-400 text-sm italic">Ajoutez vos compétences principales (ménage, plomberie, garde d'enfants...)</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-orange-500 dark:focus:border-orange-500 dark:text-white"
                value={skillInput}
                onChange={e => setSkillInput(e.target.value)}
                onKeyDown={handleSkillInputKeyDown}
                placeholder="Ex : Ménage, Baby-sitting..."
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors"
              >
                Ajouter
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">Présentation / bio</label>
            <textarea
              className="w-full min-h-[90px] p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm outline-none focus:border-orange-500 dark:focus:border-orange-500 dark:text-white resize-y"
              value={profile.bio || ''}
              onChange={e => handleProfileFieldChange('bio', e.target.value)}
              placeholder="Présentez-vous en quelques phrases : votre expérience, ce que vous proposez, votre façon de travailler..."
            />
          </div>
        </div>
      </div>

      {/* Applied Jobs / History */}
      <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 px-2">Candidatures & Missions</h3>
      <div className="space-y-3">
        {appliedJobHistory.length === 0 ? (
           <div className="text-center py-10 text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
             <Briefcase size={32} className="mx-auto mb-2 opacity-50" />
             <p>Aucune candidature pour le moment.</p>
           </div>
        ) : (
           appliedJobHistory.map(job => (
             <div key={job.id} className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 flex justify-between items-center shadow-sm">
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white">{job.title}</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{job.price} • {job.postedTime}</p>
                </div>
                <div>
                   {completedJobIds.has(job.id) ? (
                     <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-xs font-bold flex items-center gap-1">
                       <Check size={12} /> Terminé
                     </span>
                   ) : (
                     <button 
                       onClick={() => handleCompleteMission(job.id, job.title)}
                       className="px-3 py-1.5 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                     >
                       Marquer terminé
                     </button>
                   )}
                </div>
             </div>
           ))
        )}
      </div>
    </div>
    );
  };

  const PublicProfileView = () => {
    if (!selectedPublicProfile) return null;
    
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-300">
         <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-lg border border-gray-100 dark:border-gray-700 text-center">
            <div className="w-28 h-28 rounded-full bg-orange-100 dark:bg-orange-900/20 mx-auto mb-4 flex items-center justify-center text-orange-500 dark:text-orange-400 text-3xl font-bold border-4 border-white dark:border-gray-700 shadow-lg">
               {selectedPublicProfile.name.charAt(0)}
            </div>
            
            <div className="flex justify-center items-center gap-2 mb-1">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{selectedPublicProfile.name}</h2>
              {selectedPublicProfile.isPremium && <Crown size={16} className="text-amber-500 fill-amber-500" />}
            </div>
            
            <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-lg mx-auto">{selectedPublicProfile.bio}</p>

            <div className="flex justify-center gap-8 mb-8">
               <div className="text-center">
                 <span className="block text-xl font-bold text-gray-900 dark:text-white">{selectedPublicProfile.completedMissions}</span>
                 <span className="text-xs text-gray-500 uppercase tracking-wider">Missions</span>
               </div>
               <div className="text-center">
                 <span className="block text-xl font-bold text-gray-900 dark:text-white">4.8</span>
                 <span className="text-xs text-gray-500 uppercase tracking-wider">Note</span>
               </div>
            </div>

            <div className="flex gap-3 justify-center mb-8">
               <button className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200 dark:shadow-none">
                  <Mail size={18} />
                  Contacter
               </button>
               <button className="flex items-center gap-2 px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                  <ShieldCheck size={18} />
                  Signaler
               </button>
            </div>

            <div className="text-left">
              <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                 <Star size={18} className="text-amber-400 fill-amber-400" />
                 Avis récents
              </h3>
              <div className="space-y-4">
                 {selectedPublicProfile.reviews.length > 0 ? (
                   selectedPublicProfile.reviews.map(review => (
                     <div key={review.id} className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl">
                        <div className="flex justify-between items-start mb-2">
                           <span className="font-bold text-gray-900 dark:text-white text-sm">{review.clientName}</span>
                           <div className="flex gap-0.5">
                             {[...Array(5)].map((_, i) => (
                               <Star key={i} size={12} className={i < review.rating ? "text-amber-400 fill-amber-400" : "text-gray-300 dark:text-gray-600"} />
                             ))}
                           </div>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 text-sm mb-1">"{review.comment}"</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{review.jobTitle} • {review.date}</p>
                     </div>
                   ))
                 ) : (
                   <p className="text-gray-400 text-center text-sm py-4">Aucun avis pour le moment.</p>
                 )}
              </div>
            </div>
         </div>
      </div>
    );
  };

  const AboutView = () => (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-20 text-center">
       <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="w-20 h-20 bg-orange-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-orange-200 dark:shadow-none transform rotate-3">
             <Briefcase size={40} />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Je Gjobe</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
             La plateforme de mise en relation de confiance pour tous vos besoins de services à domicile et petits travaux. 
             Trouvez le bon jobber en quelques minutes ou proposez vos services à vos voisins.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
             <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
             <Zap className="mx-auto mb-2 text-amber-500" size={24} />
             <h3 className="font-bold text-gray-900 dark:text-white text-sm">Rapide</h3>
             <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Trouvez en moins de 5 min</p>
          </div>
             <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <ShieldCheck className="mx-auto mb-2 text-green-500" size={24} />
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">Sécurisé</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Profils vérifiés</p>
             </div>
             <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <Euro className="mx-auto mb-2 text-blue-500" size={24} />
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">Économique</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Prix justes</p>
             </div>
          </div>

          <div className="flex items-center justify-center gap-2 mb-6">
             <button 
                onClick={toggleNotifications}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${notificationsEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
             >
                {notificationsEnabled ? <BellRing size={16} /> : <Bell size={16} />}
                {notificationsEnabled ? 'Notifications actives' : 'Activer les notifications'}
             </button>
          </div>

          <p className="text-xs text-gray-400">Version 1.2.0 • Fait avec ❤️ par Google GenAI</p>
       </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300 pt-20">
      <Navbar />
      
      {currentView === 'home' && (
        <>
          <LocationHeader />
          <CategoryFilter />
          <JobList />
        </>
      )}

      {currentView === 'profile' && <ProfileView />}

      {currentView === 'about' && <AboutView />}

      {currentView === 'public_profile' && <PublicProfileView />}

      {currentView === 'create_job' && <CreateJobView />}
      
      <PaymentModal />
      <ConfirmationModal />
      <CancelConfirmationModal />
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);