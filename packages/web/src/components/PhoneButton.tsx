import { useRef, useEffect, useState } from 'react';

interface RadialMenuItem {
  id: string;
  label: string;
  icon?: string;
  action: () => void;
}

interface PhoneButtonProps {
  items: RadialMenuItem[];
  onOpen?: () => void;
  onClose?: () => void;
}

export function PhoneButton({ items, onOpen, onClose }: PhoneButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    if (newState) {
      onOpen?.();
    } else {
      onClose?.();
    }
  };

  const handleMenuItemClick = (item: RadialMenuItem) => {
    item.action();
    setIsOpen(false);
    onClose?.();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        onClose?.();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  const itemCount = items.length;
  const angleSlice = 360 / itemCount;

  return (
    <div className="phone-button-container">
      <button
        ref={buttonRef}
        className={`phone-button ${isOpen ? 'active' : ''}`}
        onClick={handleToggle}
        aria-label="Dial a site"
        aria-expanded={isOpen}
      >
        <span aria-hidden>☎</span>
      </button>

      {isOpen && (
        <div ref={menuRef} className="radial-menu">
          {items.map((item, index) => {
            const angle = (angleSlice * index - 90) * (Math.PI / 180);
            const radius = 80;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            return (
              <button
                key={item.id}
                className="radial-menu-item"
                onClick={() => handleMenuItemClick(item)}
                style={{
                  '--x': `${x}px`,
                  '--y': `${y}px`,
                  '--delay': `${index * 30}ms`,
                } as React.CSSProperties & { '--x': string; '--y': string; '--delay': string }}
                title={item.label}
              >
                <span className="radial-menu-icon">{item.icon || '◉'}</span>
                <span className="radial-menu-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
