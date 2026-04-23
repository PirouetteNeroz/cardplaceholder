import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchPokemonNames, fetchCardsByPokemonName, getAllJaEnAliases, type Lang, type CardListItem } from "@/lib/tcgdex-api";
import { Loader2, Search, ArrowLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { NavLink } from "@/components/NavLink";
import { IllustratorEtsyDialog } from "@/components/IllustratorEtsyDialog";

const LANGS: { value: Lang; label: string }[] = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Português" },
  { value: "ja", label: "日本語" },
];

const Pokemon = () => {
  const [lang, setLang] = useState<Lang>("fr");
  const [pokemonNames, setPokemonNames] = useState<string[]>([]);
  const [filteredNames, setFilteredNames] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedPokemon, setSelectedPokemon] = useState<string | null>(null);
  const [cards, setCards] = useState<CardListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setPokemonNames([]);
    setFilteredNames([]);
    setSelectedPokemon(null);
    setCards([]);
    setSearch("");
    try {
      const data = await fetchPokemonNames(lang);
      setPokemonNames(data);
      setFilteredNames(data);
      toast.success(`${data.length} Pokémon chargés`);
    } catch (e) {
      toast.error("Erreur lors du chargement des Pokémon");
      console.error(e);
    }
    setLoading(false);
  }, [lang]);

  const handleSearch = (value: string) => {
    setSearch(value);
    const q = value.toLowerCase();
    setFilteredNames(
      pokemonNames.filter((name) => name.toLowerCase().includes(q))
    );
  };

  const handleSelectPokemon = useCallback(async (name: string) => {
    setSelectedPokemon(name);
    setLoadingCards(true);
    try {
      const data = await fetchCardsByPokemonName(lang, name);
      setCards(data);
      toast.success(`${data.length} cartes de ${name}`);
    } catch (e) {
      toast.error("Erreur lors du chargement des cartes");
      console.error(e);
    }
    setLoadingCards(false);
  }, [lang]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-display font-bold text-foreground">Pokémon</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 ml-auto">
            <NavLink to="/" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" /> Explorer
            </NavLink>
            <NavLink to="/illustrators" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              Illustrateurs
            </NavLink>
            <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleLoad} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Charger les Pokémon
            </Button>
            <IllustratorEtsyDialog
              entityName={selectedPokemon}
              entityLabel="Pokémon"
              cards={cards}
              lang={lang}
              disabled={cards.length === 0}
              fetchCardsForLang={selectedPokemon ? (l) => fetchCardsByPokemonName(l, selectedPokemon) : undefined}
            />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {pokemonNames.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <Sparkles className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h2 className="font-display text-2xl font-bold text-foreground mb-2">Pokémon</h2>
            <p className="text-muted-foreground max-w-md">
              Parcourez tous les Pokémon du TCG. Sélectionnez une langue puis cliquez sur "Charger les Pokémon".
            </p>
          </div>
        )}

        {pokemonNames.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
            <div className="bg-card rounded-lg p-4 card-glow">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un Pokémon..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                {filteredNames.length} Pokémon
              </p>
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="space-y-1 pr-3">
                  {filteredNames.map((name) => (
                    <button
                      key={name}
                      onClick={() => handleSelectPokemon(name)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        selectedPokemon === name
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div>
              {selectedPokemon && (
                <div className="mb-4">
                  <h2 className="font-display text-xl font-bold text-foreground">{selectedPokemon}</h2>
                  <p className="text-sm text-muted-foreground">
                    {loadingCards ? "Chargement..." : `${cards.length} carte${cards.length > 1 ? "s" : ""}`}
                  </p>
                </div>
              )}

              {loadingCards && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}

              {!loadingCards && cards.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {cards.map((card) => (
                    <div
                      key={card.id}
                      className="bg-card rounded-lg p-2 text-center card-glow card-glow-hover transition-transform hover:-translate-y-1 border-t-4 border-t-primary"
                    >
                      <div className="relative aspect-[2/3] bg-muted rounded overflow-hidden flex items-center justify-center">
                        {card.image ? (
                          <img
                            src={`${card.image}/high.png`}
                            alt={card.name}
                            className="w-full h-full object-cover rounded"
                            loading="lazy"
                            onError={(e) => {
                              const target = e.currentTarget;
                              target.style.display = "none";
                              target.parentElement?.classList.add("show-fallback");
                            }}
                          />
                        ) : null}
                        <div className={`absolute inset-0 flex items-center justify-center ${card.image ? "hidden" : ""} fallback-icon`}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-16 h-16 opacity-30">
                            <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="4"/>
                            <line x1="2" y1="50" x2="98" y2="50" stroke="currentColor" strokeWidth="4"/>
                            <circle cx="50" cy="50" r="12" fill="none" stroke="currentColor" strokeWidth="4"/>
                          </svg>
                        </div>
                        <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded z-10">
                          {card.setName} #{card.localId}
                        </span>
                      </div>
                      <p className="text-xs font-semibold mt-2 truncate text-card-foreground">{card.name}</p>
                    </div>
                  ))}
                </div>
              )}

              {!loadingCards && !selectedPokemon && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Sparkles className="h-12 w-12 text-muted-foreground/20 mb-3" />
                  <p className="text-muted-foreground">Sélectionnez un Pokémon pour voir ses cartes</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Pokemon;
