import { Navigate, useParams } from "react-router-dom";

export function ImportDetailPage() {
  const { importId } = useParams();

  if (!importId) {
    return <Navigate replace to="/" />;
  }

  return <Navigate replace to={`/?import=${encodeURIComponent(importId)}`} />;
}
