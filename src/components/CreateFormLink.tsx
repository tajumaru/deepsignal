import type { MouseEvent, ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";

interface CreateFormLinkProps {
  children: ReactNode;
  className?: string;
  nav?: boolean;
}

function isModifiedEvent(event: MouseEvent<HTMLAnchorElement>) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;
}

function createFreshFormTarget() {
  return {
    pathname: "/create",
    search: `?fresh=${Date.now()}`,
  };
}

export function CreateFormLink({ children, className, nav = false }: CreateFormLinkProps) {
  const navigate = useNavigate();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || isModifiedEvent(event)) {
      return;
    }
    event.preventDefault();
    navigate(createFreshFormTarget());
  }

  if (nav) {
    return (
      <NavLink className={className} to="/create" onClick={handleClick}>
        {children}
      </NavLink>
    );
  }

  return (
    <Link className={className} to="/create" onClick={handleClick}>
      {children}
    </Link>
  );
}
