"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export type PortalUser = {
  id: string;
  email: string;
  name: string;
  contactId: string;
};

function mapSupabaseUser(user: User): PortalUser {
  const metadata = user.user_metadata || {};
  const appMetadata = user.app_metadata || {};
  const firstName = metadata.first_name || metadata.firstName || "";
  const lastName = metadata.last_name || metadata.lastName || "";
  const name = [firstName, lastName].filter(Boolean).join(" ") || user.email?.split("@")[0] || "Traveler";

  return {
    id: user.id,
    email: user.email || "",
    name,
    contactId: appMetadata.contact_id || "",
  };
}

export function useAuth() {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Get initial session
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (authUser) {
        setUser(mapSupabaseUser(authUser));
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(mapSupabaseUser(session.user));
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const logout = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return { user, loading, logout };
}
