import type { InputProps } from "./types";

type Card = { id: string; title?: string | null; description?: string | null; imageUrl?: string | null; paths?: { id: string; text?: string }[] };

/** Cards: image, title, description and one or more buttons (each button can lead elsewhere). */
export const CardsInput = ({ input, onAnswer }: InputProps) => {
  const cards = (input.items ?? []) as Card[];
  return (
    <div className="chat__cards">
      {cards.map((card) => (
        <div key={card.id} className="chat__card">
          {card.imageUrl && <img src={card.imageUrl} alt="" loading="lazy" />}
          <div className="chat__card-body">
            {card.title && <strong>{card.title}</strong>}
            {card.description && <p>{card.description}</p>}
            <div className="chat__card-actions">
              {(card.paths ?? []).map((path) => (
                <button key={path.id} type="button" className="chat__choice" onClick={() => onAnswer({ value: path.id, label: path.text || card.title || "" })}>
                  {path.text || card.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
