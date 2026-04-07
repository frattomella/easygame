import { supabase } from "./supabase";

export async function signUp(email: string, password: string, userData: any) {
  try {
    // Create user in auth system
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData,
      },
    });

    if (error) {
      console.error("Sign up error:", error);
      throw new Error(
        error.message ||
          "Errore durante la registrazione. Verifica la tua connessione internet.",
      );
    }

    // If user was created successfully, ensure their data is also in the public.users table
    // This is now handled by the database trigger, but we'll keep this as a fallback
    if (data.user) {
      // Generate a unique token verification ID for the user
      const tokenVerificationId = `user-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;

      // Check if user already exists in public.users table
      const { data: existingUser } = await supabase
        .from("users")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (!existingUser) {
        // Create entry in public.users table with first and last name separately
        const { error: insertError } = await supabase.from("users").insert([
          {
            id: data.user.id,
            email: email,
            first_name: userData.firstName || "",
            last_name: userData.lastName || "",
            phone: userData.phone || null,
            password: password, // Store password for reference
            token_verification_id: tokenVerificationId,
          },
        ]);

        if (insertError) {
          console.error(
            "Error creating user in public.users table:",
            insertError,
          );
        }
      }

      // If this is a club creator, create an organization and dashboard
      if (
        userData.role === "club_creator" ||
        userData.role === "club_manager" ||
        userData.role === "admin"
      ) {
        console.log("Creating organization and dashboard for club creator");

        // Generate a unique slug for the organization
        const orgSlug = `org-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;

        // Create the organization
        const { data: orgData, error: orgError } = await supabase
          .from("organizations")
          .insert([
            {
              name: userData.organizationName || "Nuovo Club",
              created_at: new Date().toISOString(),
              creator_id: data.user.id,
              slug: orgSlug,
            },
          ])
          .select();

        if (orgError) {
          console.error("Error creating organization:", orgError);
        } else if (orgData && orgData[0]) {
          // Create the organization_user relationship
          const { error: relError } = await supabase
            .from("organization_users")
            .insert([
              {
                organization_id: orgData[0].id,
                user_id: data.user.id,
                role: userData.role,
                created_at: new Date().toISOString(),
                is_primary: true,
              },
            ]);

          if (relError) {
            console.error(
              "Error creating organization_user relationship:",
              relError,
            );
          }

          // Generate a unique slug for the dashboard
          const dashSlug = `dash-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;

          // Create a dashboard for the organization
          const { data: dashboardData, error: dashboardError } = await supabase
            .from("dashboards")
            .insert([
              {
                organization_id: orgData[0].id,
                created_at: new Date().toISOString(),
                creator_id: data.user.id,
                slug: dashSlug,
                settings: JSON.stringify({
                  theme: "default",
                  layout: "standard",
                  widgets: [
                    "metrics",
                    "activities",
                    "trainings",
                    "certifications",
                  ],
                }),
              },
            ])
            .select();

          if (dashboardError) {
            console.error("Error creating dashboard:", dashboardError);
          }
        }
      }
    }

    return data;
  } catch (e) {
    console.error("Unexpected sign up error:", e);
    throw new Error(
      e instanceof Error
        ? e.message
        : "Errore durante la registrazione. Verifica la tua connessione internet.",
    );
  }
}

export async function signIn(email: string, password: string) {
  try {
    console.log("Auth lib signIn attempt with:", email);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    console.log("Auth lib signIn response:", { data, error });

    if (error) {
      console.error("Sign in error:", error);
      if (
        error.message.includes("Failed to fetch") ||
        error.message.includes("NetworkError")
      ) {
        throw new Error(
          "Errore di connessione al server. Verifica la tua connessione internet.",
        );
      }
      throw new Error(
        error.message ||
          "Errore durante l'accesso. Verifica le tue credenziali.",
      );
    }
    return data;
  } catch (e) {
    console.error("Unexpected sign in error:", e);
    if (e instanceof Error) {
      throw e; // Rethrow the error if it's already an Error object
    }
    throw new Error(
      "Errore di connessione al server. Verifica la tua connessione internet.",
    );
  }
}

export async function signOut() {
  try {
    // Clear saved accounts from localStorage
    localStorage.removeItem("mockUser");

    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Sign out error:", error);
      throw new Error(error.message || "Errore durante il logout.");
    }
  } catch (e) {
    console.error("Unexpected sign out error:", e);
    throw new Error(
      e instanceof Error ? e.message : "Errore durante il logout.",
    );
  }
}

export async function getCurrentUser() {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Get session error:", sessionError);
      throw new Error(
        sessionError.message || "Errore di connessione al server.",
      );
    }

    if (!session) return null;

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("Get user error:", userError);
      throw new Error(
        userError.message || "Errore nel recupero dei dati utente.",
      );
    }

    return user;
  } catch (e) {
    console.error("Unexpected get current user error:", e);
    throw new Error(
      e instanceof Error ? e.message : "Errore di connessione al server.",
    );
  }
}

// Generate a random access code for club managers
export function generateAccessCode() {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  const charactersLength = characters.length;
  for (let i = 0; i < 10; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// Generate a token for trainers, athletes, and parents
export function generateUserToken(userType: string) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  const charactersLength = characters.length;

  // Trainers get a 5-character token
  const length = userType === "trainer" ? 5 : 8;

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// Validate access code
export async function validateAccessCode(code: string) {
  try {
    // In a real implementation, this would check the database for a valid code
    // and verify it hasn't expired (3 minutes from creation)

    // For demo purposes, we'll just check if it's the right format
    if (code.length !== 10) {
      return { valid: false, message: "Codice di accesso non valido" };
    }

    return { valid: true };
  } catch (e) {
    console.error("Error validating access code:", e);
    return {
      valid: false,
      message: "Errore durante la validazione del codice",
    };
  }
}

// Validate user token
export async function validateUserToken(token: string, userType: string) {
  try {
    // In a real implementation, this would check the database for a valid token
    // and verify it matches the user type

    // For demo purposes, we'll just check if it's the right format
    if (userType === "trainer" && token.length !== 5) {
      return { valid: false, message: "Token allenatore non valido" };
    }

    if (
      (userType === "athlete" || userType === "parent") &&
      token.length !== 8
    ) {
      return { valid: false, message: "Token utente non valido" };
    }

    return { valid: true };
  } catch (e) {
    console.error("Error validating user token:", e);
    return { valid: false, message: "Errore durante la validazione del token" };
  }
}
