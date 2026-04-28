"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { validateAccessCode, validateUserToken } from "@/lib/auth";
import { useToast } from "@/components/ui/toast-notification";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/providers/AuthProvider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { ClubCreationForm } from "@/components/forms/ClubCreationForm";
import ProfileModal from "./profile-modal";

export default function TokenVerificationPage() {
  const [tokenLength, setTokenLength] = useState<5 | 8 | 10>(5);
  const [tokenValues, setTokenValues] = useState<string[]>(Array(10).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userClubs, setUserClubs] = useState<any[]>([]);
  const [showTokenSection, setShowTokenSection] = useState(false);
  const [showClubCreationForm, setShowClubCreationForm] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [userProfile, setUserProfile] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    gender: "",
  });
  const router = useRouter();
  const { showToast } = useToast();
  const { user, isClubCreator } = useAuth();
  const [userName, setUserName] = useState<string>("Nome");
  const params = useParams<{ userId: string | string[] }>();
  // Safely access userId from params or user object
  const userId = params?.userId
    ? Array.isArray(params?.userId)
      ? params?.userId[0]
      : (params?.userId as string)
    : user?.id || "";
  console.log("Token verification page - userId:", userId);
  console.log("User is club creator:", isClubCreator);

  // Function to handle successful club creation
  const handleClubCreationSuccess = (clubData: any) => {
    console.log(
      "Club created successfully in token verification page:",
      clubData,
    );

    // Add to user's clubs in local state
    setUserClubs((prev) => {
      // Check if club already exists in state to avoid duplicates
      if (prev.some((club) => club.id === clubData.id)) {
        return prev;
      }
      return [...prev, clubData];
    });

    // Update localStorage
    const storedClubs = localStorage.getItem(`userClubs_${userId}`);
    let updatedClubs = [clubData];

    if (storedClubs) {
      try {
        const parsedClubs = JSON.parse(storedClubs);
        // Check if club already exists to avoid duplicates
        if (!parsedClubs.some((club: any) => club.id === clubData.id)) {
          updatedClubs = [...parsedClubs, clubData];
        } else {
          updatedClubs = parsedClubs;
        }
      } catch (e) {
        console.error("Error parsing stored clubs:", e);
      }
    }

    localStorage.setItem(`userClubs_${userId}`, JSON.stringify(updatedClubs));
    localStorage.setItem(`activeClub_${userId}`, JSON.stringify(clubData));
    localStorage.setItem("activeClub", JSON.stringify(clubData)); // For backward compatibility

    showToast("success", "Club creato con successo!");
    setShowClubCreationForm(false);

    // Don't automatically redirect, just show the club in the list
    setShowTokenSection(false);
  };

  // Add timeout to prevent infinite loading
  useEffect(() => {
    let redirectTimeout: NodeJS.Timeout;

    if (!userId) {
      console.log("No userId available, setting redirect timeout");
      redirectTimeout = setTimeout(() => {
        console.log("No user ID found after timeout, redirecting to login");
        router.push("/login");
      }, 3000); // 3 second timeout
    } else {
      console.log("userId available, no redirect needed:", userId);
    }

    return () => {
      if (redirectTimeout) clearTimeout(redirectTimeout);
    };
  }, [userId, router]);

  // Check if user data is available in localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Check if there's a stored profile image
      const storedProfileImage = localStorage.getItem(`profileImage_${userId}`);
      const storedUserName = localStorage.getItem(`userName_${userId}`);

      if (storedProfileImage) {
        setProfileImage(storedProfileImage);
      }

      if (storedUserName) {
        setUserName(storedUserName);
      }

      // Check if there are stored clubs
      const storedClubs = localStorage.getItem(`userClubs_${userId}`);
      if (storedClubs) {
        try {
          const parsedClubs = JSON.parse(storedClubs);
          setUserClubs(parsedClubs);
          console.log(
            `Loaded ${parsedClubs.length} clubs from localStorage for user ${userId}`,
          );

          // Hide token section if we have clubs
          if (parsedClubs.length > 0) {
            setShowTokenSection(false);
          }
        } catch (e) {
          console.error("Error parsing stored clubs:", e);
        }
      }
    }
  }, [userId]);

  // Check if user is a club creator and load their clubs without automatic redirection
  useEffect(() => {
    const loadClubCreatorData = async () => {
      // Check both user_metadata.isClubCreator and user_metadata.role for club creator status
      const isCreator =
        user?.user_metadata?.isClubCreator === true ||
        user?.user_metadata?.role === "club_creator" ||
        user?.user_metadata?.role === "club_manager" ||
        user?.user_metadata?.role === "admin";

      if (isCreator) {
        console.log(
          "User is a club creator, loading clubs without auto-redirect",
        );

        const fetchClubsWithRetry = async (
          retryCount = 0,
        ): Promise<any[] | null> => {
          try {
            const { data: clubs, error: clubsError } = await supabase
              .from("clubs")
              .select("*")
              .eq("creator_id", userId);

            if (clubsError) {
              // Handle network errors with retry
              if (
                clubsError.message?.includes("Failed to fetch") &&
                retryCount < 3
              ) {
                console.log(
                  `Retry attempt ${retryCount + 1} for fetching clubs...`,
                );
                await new Promise((resolve) =>
                  setTimeout(resolve, 1000 * (retryCount + 1)),
                );
                return fetchClubsWithRetry(retryCount + 1);
              }
              console.error("Error fetching clubs:", clubsError);
              return null;
            }
            return clubs;
          } catch (err) {
            if (retryCount < 3) {
              console.log(
                `Retry attempt ${retryCount + 1} for fetching clubs...`,
              );
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * (retryCount + 1)),
              );
              return fetchClubsWithRetry(retryCount + 1);
            }
            console.error("Error fetching clubs:", err);
            return null;
          }
        };

        try {
          // Check if the user has any clubs
          const clubs = await fetchClubsWithRetry();

          if (!clubs) {
            return;
          }

          if (clubs && clubs.length > 0) {
            console.log(`Found ${clubs.length} clubs for club creator`);

            // Process clubs and add them to userClubs state
            const creatorClubs = clubs.map((club) => ({
              id: club.id,
              name: club.name || "Mio Club",
              role: "club_creator",
              roleLabel: "Creatore",
              color: "#3b82f6",
              addedAt: club.created_at,
              logo_url: club.logo_url,
            }));

            // Add to userClubs state
            setUserClubs((prev) => {
              // Filter out any duplicates
              const existingIds = prev.map((club) => club.id);
              const newClubs = creatorClubs.filter(
                (club) => !existingIds.includes(club.id),
              );
              return [...prev, ...newClubs];
            });

            // Update localStorage
            const storedClubs = localStorage.getItem(`userClubs_${userId}`);
            let updatedClubs = creatorClubs;

            if (storedClubs) {
              try {
                const parsedClubs = JSON.parse(storedClubs);
                // Merge clubs, avoiding duplicates
                const existingIds = parsedClubs.map((club: any) => club.id);
                const newClubs = creatorClubs.filter(
                  (club) => !existingIds.includes(club.id),
                );
                updatedClubs = [...parsedClubs, ...newClubs];
              } catch (e) {
                console.error("Error parsing stored clubs:", e);
              }
            }

            localStorage.setItem(
              `userClubs_${userId}`,
              JSON.stringify(updatedClubs),
            );

            // Don't show token section by default
            setShowTokenSection(false);
          } else {
            // No clubs found, but user is a club creator
            // Check if user has any club associations in their profile
            console.log(
              "No clubs found for club creator, checking user profile",
            );

            const { data: userData, error: userError } = await supabase
              .from("users")
              .select("club_access")
              .eq("id", userId)
              .single();

            if (userError && userError.code !== "PGRST116") {
              console.error("Error fetching user data:", userError);
              return;
            }

            const clubAccess = userData?.club_access || [];

            if (clubAccess.length > 0) {
              console.log(
                `Found ${clubAccess.length} club associations for user`,
              );

              // Process all club associations
              for (const access of clubAccess) {
                const clubId = access.club_id;

                // Get club details
                const { data: clubDetails, error: clubDetailsError } =
                  await supabase
                    .from("clubs")
                    .select("*")
                    .eq("id", clubId)
                    .single();

                if (clubDetailsError) {
                  console.error(
                    "Error fetching club details:",
                    clubDetailsError,
                  );
                  continue;
                }

                if (clubDetails) {
                  // Create club object for state
                  const clubData = {
                    id: clubId,
                    name: clubDetails.name || "Mio Club",
                    role: access.role || "club_creator",
                    roleLabel: getRoleLabel(access.role || "club_creator"),
                    color: "#3b82f6",
                    addedAt: clubDetails.created_at,
                    logo_url: clubDetails.logo_url,
                  };

                  // Add to userClubs state
                  setUserClubs((prev) => {
                    if (!prev.some((club) => club.id === clubData.id)) {
                      return [...prev, clubData];
                    }
                    return prev;
                  });
                }
              }

              // Update localStorage with all clubs
              localStorage.setItem(
                `userClubs_${userId}`,
                JSON.stringify(userClubs),
              );

              // Don't show token section by default
              setShowTokenSection(false);
            } else {
              // Show club creation form if no clubs or associations found
              setShowClubCreationForm(true);
              setShowTokenSection(true);
            }
          }
        } catch (err) {
          console.error("Error loading club creator data:", err);
        }
      } else {
        // For non-club creators, always show token section
        setShowTokenSection(true);
      }
    };

    // Check if userId is available and user is loaded
    if (userId && user) {
      loadClubCreatorData();
    }
  }, [userId, user]);

  // Initialize user profile from database, metadata, and localStorage
  useEffect(() => {
    if (!userId) {
      console.log("Skipping profile initialization - no userId available");
      return; // Don't proceed if no userId is available
    }

    // Don't show token section by default - only when user clicks the button
    setShowTokenSection(false);

    console.log("Initializing user profile for userId:", userId);

    // First try to load from localStorage for immediate display
    const storedProfile = localStorage.getItem(`userProfile_${userId}`);
    if (storedProfile) {
      try {
        const parsedProfile = JSON.parse(storedProfile);
        setUserProfile((prev) => ({
          ...prev,
          firstName: parsedProfile.firstName || prev.firstName,
          lastName: parsedProfile.lastName || prev.lastName,
          phone: parsedProfile.phone || prev.phone,
          gender: parsedProfile.gender || prev.gender,
        }));

        if (parsedProfile.profileImage) {
          setProfileImage(parsedProfile.profileImage);
        }

        if (parsedProfile.firstName && parsedProfile.lastName) {
          setUserName(`${parsedProfile.firstName} ${parsedProfile.lastName}`);
        }
      } catch (e) {
        console.error("Error parsing stored profile:", e);
      }
    }

    // Load user data from database (most authoritative)
    const loadUserData = async (retryCount = 0) => {
      try {
        console.log(`Loading user data from database for user ${userId}`);
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("*")
          .eq("id", userId)
          .single();

        if (userError && userError.code !== "PGRST116") {
          // PGRST116 is the error code for no rows returned
          // Handle network errors with retry
          if (
            userError.message?.includes("Failed to fetch") &&
            retryCount < 3
          ) {
            console.log(
              `Retry attempt ${retryCount + 1} for loading user data...`,
            );
            setTimeout(
              () => loadUserData(retryCount + 1),
              1000 * (retryCount + 1),
            );
            return;
          }
          console.error("Error loading user data from database:", userError);
        }

        if (userData) {
          console.log(`User data loaded from database:`, userData);
          setUserProfile((prev) => ({
            ...prev,
            firstName: userData.first_name || prev.firstName,
            lastName: userData.last_name || prev.lastName,
            email: userData.email || prev.email,
            phone: userData.phone || prev.phone,
            gender: userData.gender || prev.gender,
          }));

          if (userData.profile_image) {
            setProfileImage(userData.profile_image);
          }

          if (userData.first_name && userData.last_name) {
            setUserName(`${userData.first_name} ${userData.last_name}`);
          }
        }
      } catch (err: any) {
        // Handle network errors with retry
        if (err?.message?.includes("Failed to fetch") && retryCount < 3) {
          console.log(
            `Retry attempt ${retryCount + 1} for loading user data...`,
          );
          setTimeout(
            () => loadUserData(retryCount + 1),
            1000 * (retryCount + 1),
          );
          return;
        }
        console.error("Error in loadUserData:", err);
      }
    };

    // Then load from user metadata
    if (user?.user_metadata) {
      const metadata = user.user_metadata;
      if (metadata.firstName && metadata.lastName) {
        setUserName(`${metadata.firstName} ${metadata.lastName}`);
      } else if (metadata.name) {
        setUserName(metadata.name);
      } else if (user.email) {
        setUserName(user.email.split("@")[0]);
      }

      setUserProfile({
        firstName: metadata.firstName || "",
        lastName: metadata.lastName || "",
        email: user.email || "",
        phone: metadata.phone || "",
        gender: metadata.gender || "",
      });

      if (metadata.profileImage) {
        setProfileImage(metadata.profileImage);
      }
    }

    // Load user data from database
    loadUserData();

    // Load user-specific clubs from localStorage first for immediate display
    const loadUserClubs = () => {
      const storedClubs = localStorage.getItem(`userClubs_${userId}`);
      if (storedClubs) {
        try {
          const parsedClubs = JSON.parse(storedClubs);
          setUserClubs(parsedClubs);
          if (parsedClubs.length > 0) {
            setShowTokenSection(false);
          }
        } catch (e) {
          console.error("Error parsing stored clubs:", e);
        }
      }
    };

    loadUserClubs();

    // Load clubs from database in background (debounced)
    const loadClubsFromDatabase = async () => {
      if (!userId || !user) return;

      try {
        const isCreator =
          user?.user_metadata?.isClubCreator === true ||
          user?.user_metadata?.role === "club_creator" ||
          user?.user_metadata?.role === "club_manager" ||
          user?.user_metadata?.role === "admin";

        let allClubs = [];

        if (isCreator) {
          const { data: createdClubs } = await supabase
            .from("clubs")
            .select("id, name, created_at, logo_url")
            .eq("creator_id", userId);

          if (createdClubs && createdClubs.length > 0) {
            allClubs = createdClubs.map((club) => ({
              id: club.id,
              name: club.name || "Club senza nome",
              role: "club_creator",
              roleLabel: "Creatore",
              color: getRandomColor(),
              addedAt: club.created_at,
              logo_url: club.logo_url || null,
            }));
          }
        }

        if (allClubs.length > 0) {
          setUserClubs(allClubs);
          localStorage.setItem(`userClubs_${userId}`, JSON.stringify(allClubs));
        }
        // Don't show token section by default
        setShowTokenSection(false);
      } catch (err) {
        console.error("Error loading clubs from database:", err);
      }
    };

    // Debounce database loading
    const timeoutId = setTimeout(loadClubsFromDatabase, 500);
    return () => clearTimeout(timeoutId);
  }, [user, userId, showToast]);

  // Helper function to get role label
  const getRoleLabel = (role: string): string => {
    switch (role) {
      case "club_creator":
        return "Creatore";
      case "owner":
        return "Gestore";
      case "admin":
        return "Amministratore";
      case "trainer":
        return "Allenatore";
      case "athlete":
        return "Atleta";
      case "parent":
        return "Genitore";
      default:
        return "Utente";
    }
  };

  // Helper function to get random color
  const getRandomColor = (): string => {
    const colors = [
      "#ef4444",
      "#22c55e",
      "#a855f7",
      "#f97316",
      "#3b82f6",
      "#ec4899",
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // Handle token input change
  const handleTokenInputChange = (index: number, value: string) => {
    if (value.length > 1) {
      // If pasting multiple characters, distribute them across inputs
      const chars = value.split("");
      const newTokenValues = [...tokenValues];

      for (let i = 0; i < chars.length && index + i < tokenLength; i++) {
        newTokenValues[index + i] = chars[i].toUpperCase();
      }

      setTokenValues(newTokenValues);

      // Focus on the next empty input or the last one
      const nextEmptyIndex = newTokenValues.findIndex(
        (val, idx) => idx >= index && !val,
      );
      if (nextEmptyIndex !== -1 && nextEmptyIndex < tokenLength) {
        document.getElementById(`token-input-${nextEmptyIndex}`)?.focus();
      } else {
        document.getElementById(`token-input-${tokenLength - 1}`)?.focus();
      }
    } else {
      // Single character input
      const newTokenValues = [...tokenValues];
      newTokenValues[index] = value.toUpperCase();
      setTokenValues(newTokenValues);

      // Auto-focus next input if current one is filled
      if (value && index < tokenLength - 1) {
        document.getElementById(`token-input-${index + 1}`)?.focus();
      }
    }
  };

  // Handle backspace key
  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !tokenValues[index] && index > 0) {
      // Move focus to previous input when backspace is pressed on empty input
      document.getElementById(`token-input-${index - 1}`)?.focus();
    }
  };

  // Handle token length selection
  const handleTokenLengthChange = (length: 5 | 8 | 10) => {
    setTokenLength(length);
    setTokenValues(Array(10).fill(""));
    // Focus on the first input after changing length
    setTimeout(() => {
      document.getElementById("token-input-0")?.focus();
    }, 0);
  };

  const getTokenTypeFromLength = (length: number): string => {
    switch (length) {
      case 5:
        return "trainer";
      case 8:
        return "athlete";
      case 10:
        return "club_manager";
      default:
        return "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Combine token values
      const token = tokenValues.slice(0, tokenLength).join("");

      if (token.length !== tokenLength) {
        throw new Error(`Inserisci tutti i ${tokenLength} caratteri del token`);
      }

      console.log(
        `Token verification started for user ${userId} with token length ${tokenLength}`,
      );

      // Validate token based on type
      const tokenType = getTokenTypeFromLength(tokenLength);
      let validationResult;

      if (tokenType === "club_manager") {
        validationResult = await validateAccessCode(token);
      } else {
        validationResult = await validateUserToken(token, tokenType);
      }

      if (!validationResult.valid) {
        setError(validationResult.message || "Token non valido");
        showToast("error", validationResult.message || "Token non valido");
        setLoading(false);
        return;
      }

      console.log(
        `Token validated successfully for user ${userId} with role ${tokenType}`,
      );

      // Look for existing clubs that match this token
      // In a real implementation, tokens would be stored in the database with club associations
      // For now, we'll search for clubs that have trainers with matching tokens
      let existingClub = null;
      let clubData = null;

      try {
        // Search for clubs that have this token in their trainers or staff data
        const { data: allClubs, error: searchError } = await supabase
          .from("clubs")
          .select("*");

        if (!searchError && allClubs) {
          for (const club of allClubs) {
            // Check trainers array
            if (club.trainers && Array.isArray(club.trainers)) {
              const matchingTrainer = club.trainers.find(
                (trainer: any) => trainer.token === token,
              );
              if (matchingTrainer) {
                existingClub = club;
                break;
              }
            }

            // Check staff_members array
            if (club.staff_members && Array.isArray(club.staff_members)) {
              const matchingStaff = club.staff_members.find(
                (staff: any) => staff.token === token,
              );
              if (matchingStaff) {
                existingClub = club;
                break;
              }
            }

            // Check members array for staff_data
            if (club.members && Array.isArray(club.members)) {
              const matchingMember = club.members.find(
                (member: any) =>
                  member.staff_data && member.staff_data.token === token,
              );
              if (matchingMember) {
                existingClub = club;
                break;
              }
            }
          }
        }
      } catch (searchErr) {
        console.error("Error searching for existing clubs:", searchErr);
      }

      if (existingClub) {
        console.log(`Found existing club for token:`, existingClub);
        clubData = [existingClub];
      } else {
        // If no existing club found, reject the token
        console.log(`No existing club found for token, rejecting`);
        throw new Error("Token non valido o non riconosciuto");
      }

      const roleLabel =
        tokenType === "club_manager"
          ? "Gestore"
          : tokenType === "trainer"
            ? "Allenatore"
            : tokenType === "athlete"
              ? "Atleta"
              : "Genitore";

      const colors = [
        "#ef4444",
        "#22c55e",
        "#a855f7",
        "#f97316",
        "#3b82f6",
        "#ec4899",
      ];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      let newClubAccess = {
        id: clubData && clubData[0] ? clubData[0].id : `club-${Date.now()}`,
        name: clubData && clubData[0] ? clubData[0].name : "Club sconosciuto",
        role: tokenType,
        roleLabel: roleLabel,
        token: token,
        color: randomColor,
        addedAt: new Date().toISOString(),
        logo_url: clubData && clubData[0] ? clubData[0].logo_url : null,
      };

      console.log(`Club data for token verification:`, clubData);

      if (clubData && clubData[0]) {
        // Update user's club_access in the users table
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("club_access")
          .eq("id", userId)
          .single();

        const clubAccess = userData?.club_access || [];

        // Check if user already has access to this club
        const existingAccess = clubAccess.find(
          (access: any) => access.club_id === clubData[0].id,
        );

        if (!existingAccess) {
          clubAccess.push({
            club_id: clubData[0].id,
            role: tokenType,
            is_primary: clubAccess.length === 0,
          });

          const { error: updateError } = await supabase
            .from("users")
            .update({ club_access: clubAccess })
            .eq("id", userId);

          if (updateError) {
            console.error("Error updating user club access:", updateError);
            throw updateError;
          }
        }

        // Create a dashboard if it doesn't exist
        const { data: existingDashboard } = await supabase
          .from("dashboards")
          .select("id")
          .eq("organization_id", clubData[0].id)
          .single();

        if (!existingDashboard) {
          console.log(`Creating dashboard for club ${clubData[0].id}`);

          const { data: dashboardData, error: dashboardError } = await supabase
            .from("dashboards")
            .insert([
              {
                organization_id: clubData[0].id,
                created_at: new Date().toISOString(),
                creator_id: userId,
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
            // Non-critical error, continue execution
          } else {
            console.log(
              `Dashboard created successfully for club ${clubData[0].id}`,
            );
          }
        }
      }

      // Add to user's clubs in local state
      const updatedClubs = [...userClubs, newClubAccess];
      setUserClubs(updatedClubs);
      localStorage.setItem(`userClubs_${userId}`, JSON.stringify(updatedClubs));

      console.log(`Club access added successfully for user ${userId}`);
      showToast("success", `Accesso al club aggiunto con successo!`);

      // Reset form and hide token section
      setTokenValues(Array(10).fill(""));
      setShowTokenSection(false);
    } catch (err: any) {
      console.error("Token verification error:", err);
      setError(err.message || "Errore durante la verifica del token");
      showToast(
        "error",
        `Errore: ${err.message || "Errore durante la verifica del token"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClubSelect = (club: any) => {
    console.log("Club selected:", club);
    // Check if profile is complete before redirecting
    if (!userProfile.firstName || !userProfile.lastName) {
      showToast("error", "Completa il tuo profilo prima di accedere al club");
      setShowProfileModal(true);
      return;
    }

    // Set the active club in the user's session and redirect to the appropriate dashboard based on the role
    let redirectPath = "";

    // First check if this club has a dashboard
    const checkAndRedirectToDashboard = async () => {
      try {
        console.log(`Checking for dashboard for club ${club.id}`);
        const { data: dashboardData, error: dashboardError } = await supabase
          .from("dashboards")
          .select("id")
          .eq("organization_id", club.id)
          .single();

        if (dashboardError && dashboardError.code !== "PGRST116") {
          console.error("Error checking for dashboard:", dashboardError);
        }

        // If dashboard exists, use its ID in the redirect
        if (dashboardData && dashboardData.id) {
          console.log(
            `Found dashboard ${dashboardData.id} for club ${club.id}`,
          );

          switch (club.role) {
            case "club_creator":
            case "club_manager":
            case "owner":
            case "admin":
              redirectPath = `/dashboard/${dashboardData.id}?clubId=${club.id}`;
              break;
            case "trainer":
              redirectPath = `/trainer-dashboard/${dashboardData.id}?clubId=${club.id}`;
              break;
            case "athlete":
              redirectPath = `/parent-view/${club.id}/${dashboardData.id}`;
              break;
            case "parent":
              redirectPath = `/parent-view/${club.id}/${dashboardData.id}`;
              break;
            default:
              redirectPath = `/dashboard/${dashboardData.id}?clubId=${club.id}`;
              break;
          }
        } else {
          // If no dashboard exists, create one
          console.log(`No dashboard found for club ${club.id}, creating one`);
          const { data: newDashboard, error: createError } = await supabase
            .from("dashboards")
            .insert([
              {
                organization_id: club.id,
                created_at: new Date().toISOString(),
                creator_id: userId,
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

          if (createError) {
            console.error("Error creating dashboard:", createError);
            // Fall back to generic paths
            switch (club.role) {
              case "club_creator":
              case "club_manager":
              case "owner":
              case "admin":
                redirectPath = `/dashboard?clubId=${club.id}`;
                break;
              case "trainer":
                redirectPath = `/trainer-dashboard?clubId=${club.id}`;
                break;
              case "athlete":
                redirectPath = `/parent-view/${club.id}`;
                break;
              case "parent":
                redirectPath = `/parent-view/${club.id}`;
                break;
              default:
                redirectPath = `/dashboard?clubId=${club.id}`;
                break;
            }
          } else if (newDashboard && newDashboard[0]) {
            console.log(
              `Created dashboard ${newDashboard[0].id} for club ${club.id}`,
            );
            // Use the new dashboard ID in the redirect
            switch (club.role) {
              case "club_creator":
              case "club_manager":
              case "owner":
              case "admin":
                redirectPath = `/dashboard/${newDashboard[0].id}?clubId=${club.id}`;
                break;
              case "trainer":
                redirectPath = `/trainer-dashboard/${newDashboard[0].id}?clubId=${club.id}`;
                break;
              case "athlete":
                redirectPath = `/parent-view/clubId/${club.id}/dashboardId/${newDashboard[0].id}`;
                break;
              case "parent":
                redirectPath = `/parent-view/clubId/${club.id}/dashboardId/${newDashboard[0].id}`;
                break;
              default:
                redirectPath = `/dashboard/${newDashboard[0].id}?clubId=${club.id}`;
                break;
            }
          }
        }

        // Store the active club in localStorage with user-specific key
        if (userId) {
          localStorage.setItem(`activeClub_${userId}`, JSON.stringify(club));
          localStorage.setItem("activeClub", JSON.stringify(club)); // Keep for backward compatibility
          console.log(
            `Stored active club for user ${userId} in localStorage:`,
            club.name,
          );
        }

        // Redirect to the appropriate dashboard
        console.log(`Redirecting to ${redirectPath}`);
        router.push(redirectPath);
      } catch (err) {
        console.error("Error in checkAndRedirectToDashboard:", err);
        // Fallback to generic dashboard path
        redirectPath = `/dashboard?clubId=${club.id}`;
        router.push(redirectPath);
      }
    };

    checkAndRedirectToDashboard();
  };

  // Function to delete a club access
  const handleDeleteClub = async (clubId: string) => {
    try {
      if (!userId) {
        throw new Error("User ID not available");
      }

      console.log(
        `Attempting to delete club access for club ${clubId} and user ${userId}`,
      );

      // Check if the user is the creator of this club
      const clubToDelete = userClubs.find((club) => club.id === clubId);
      const isClubCreator =
        clubToDelete?.role === "club_creator" || clubToDelete?.role === "owner";

      if (isClubCreator) {
        // If user is the club creator, delete the entire club from the database
        const { error: deleteClubError } = await supabase
          .from("clubs")
          .delete()
          .eq("id", clubId)
          .eq("creator_id", userId); // Extra safety check

        if (deleteClubError) {
          console.error("Error deleting club:", deleteClubError);
          throw deleteClubError;
        }

        // Also delete any associated dashboards
        const { error: deleteDashboardError } = await supabase
          .from("dashboards")
          .delete()
          .eq("organization_id", clubId);

        if (deleteDashboardError) {
          console.error("Error deleting dashboard:", deleteDashboardError);
          // Non-critical error, continue execution
        }

        console.log(`Club ${clubId} and associated data deleted successfully`);
      } else {
        // If user is not the creator, just remove their access
        // First get current user data
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("club_access")
          .eq("id", userId)
          .single();

        if (userError && userError.code !== "PGRST116") {
          console.error("Error fetching user club access:", userError);
          // If user doesn't exist in users table, create entry
          if (userError.code === "PGRST116") {
            const { error: createUserError } = await supabase
              .from("users")
              .insert({
                id: userId,
                email: user?.email || "",
                club_access: [],
              });

            if (createUserError) {
              console.error("Error creating user entry:", createUserError);
            }
          }
        }

        const clubAccess = userData?.club_access || [];
        const updatedClubAccess = clubAccess.filter(
          (access: any) => access.club_id !== clubId,
        );

        console.log(
          `Updating user club access from:`,
          clubAccess,
          `to:`,
          updatedClubAccess,
        );

        // Update or insert user record with updated club access
        const { error: updateError } = await supabase.from("users").upsert(
          {
            id: userId,
            email: user?.email || "",
            club_access: updatedClubAccess,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "id",
          },
        );

        if (updateError) {
          console.error("Error updating user club access:", updateError);
          throw updateError;
        }

        // Also remove from club's members array if it exists
        try {
          const { data: clubData, error: clubFetchError } = await supabase
            .from("clubs")
            .select("members")
            .eq("id", clubId)
            .single();

          if (!clubFetchError && clubData?.members) {
            const updatedMembers = clubData.members.filter(
              (member: any) => member.user_id !== userId,
            );

            await supabase
              .from("clubs")
              .update({
                members: updatedMembers,
                updated_at: new Date().toISOString(),
              })
              .eq("id", clubId);
          }
        } catch (memberUpdateError) {
          console.warn(
            "Could not update club members array:",
            memberUpdateError,
          );
        }

        console.log(`User access to club ${clubId} removed successfully`);
      }

      // Update local state
      const updatedClubs = userClubs.filter((club) => club.id !== clubId);
      setUserClubs(updatedClubs);
      localStorage.setItem(`userClubs_${userId}`, JSON.stringify(updatedClubs));

      // Clear active club if it was the deleted one
      const activeClub = localStorage.getItem(`activeClub_${userId}`);
      if (activeClub) {
        try {
          const parsedActiveClub = JSON.parse(activeClub);
          if (parsedActiveClub.id === clubId) {
            localStorage.removeItem(`activeClub_${userId}`);
            localStorage.removeItem("activeClub");
          }
        } catch (e) {
          console.error("Error parsing active club:", e);
        }
      }

      showToast(
        "success",
        isClubCreator
          ? "Club eliminato con successo"
          : "Accesso rimosso con successo",
      );
    } catch (err: any) {
      console.error("Error removing club access:", err);
      showToast(
        "error",
        `Errore nella rimozione dell'accesso: ${err.message || err}`,
      );
    }
  };

  // Handle profile update
  const handleProfileUpdate = (name: string, image: string) => {
    setUserName(name);
    setProfileImage(image);
    setShowProfileModal(false);

    // Update user profile in localStorage
    localStorage.setItem(
      `userProfile_${userId}`,
      JSON.stringify({
        ...userProfile,
        firstName: name.split(" ")[0] || "",
        lastName: name.split(" ").slice(1).join(" ") || "",
        profileImage: image,
      }),
    );

    showToast("success", "Profilo aggiornato con successo");
  };

  // Handle profile menu
  const handleProfileMenu = () => {
    router.push(`/profile/${userId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center p-4">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* App Logo and Name */}
        <div className="flex flex-col items-center mb-4">
          <img
            src="https://r2.fivemanage.com/LxmV791LM4K69ERXKQGHd/image/logo.png"
            alt="EasyGame Logo"
            className="h-16 w-auto mb-2"
          />
          <h1 className="text-2xl font-bold text-white">EasyGame</h1>
        </div>

        {/* User Profile Header */}
        <div className="flex flex-col items-center mb-8">
          <button
            onClick={handleProfileMenu}
            className="relative cursor-pointer group"
          >
            <Avatar className="h-20 w-20 mb-4 border-4 border-white group-hover:border-blue-300 transition-all">
              {profileImage ? (
                <img
                  src={profileImage}
                  alt="Profile"
                  className="h-full w-full object-cover profile-avatar-image"
                />
              ) : (
                <div className="bg-gray-200 h-full w-full flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-12 w-12 text-gray-400 profile-avatar-svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
              )}
            </Avatar>
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded-full flex items-center justify-center transition-all">
              <span className="text-white opacity-0 group-hover:opacity-100 text-xs font-medium">
                Modifica
              </span>
            </div>
          </button>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2 user-display-name">
            <span className="text-3xl">👋</span> Ciao, {userName}
          </h1>
        </div>

        {/* I tuoi club registrati section - Always show with 3 fixed slots */}
        <div className="bg-white rounded-3xl shadow-xl p-4">
          <div className="flex items-center justify-center mb-3">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
            <h2 className="text-lg font-semibold text-center">
              I tuoi club registrati
            </h2>
          </div>
          <p className="text-xs text-gray-500 text-center mb-4">
            Club di cui sei proprietario o creatore
          </p>
          <div className="grid grid-cols-3 gap-3">
            {/* Display user's created clubs and empty slots (always 3 total) */}
            {Array.from({ length: 3 }).map((_, index) => {
              const club = userClubs
                .filter(
                  (club) =>
                    club.role === "club_creator" || club.role === "owner",
                )
                .slice(0, 3)[index];

              if (club) {
                return (
                  <div
                    key={club.id}
                    className="bg-white rounded-xl shadow-md p-3 transition-all hover:shadow-lg border border-green-200 flex flex-col items-center text-center relative"
                  >
                    <div
                      className="w-16 h-16 mb-2 flex items-center justify-center cursor-pointer"
                      onClick={() => handleClubSelect(club)}
                    >
                      {club.logo_url ? (
                        <img
                          src={club.logo_url}
                          alt={`${club.name} Logo`}
                          className="w-full h-full object-contain rounded-lg"
                          onError={(e) => {
                            // Fallback to initials if logo fails to load
                            e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${club.name}`;
                          }}
                        />
                      ) : (
                        <img
                          src={`https://api.dicebear.com/7.x/initials/svg?seed=${club.name}`}
                          alt={`${club.name} Logo`}
                          className="w-full h-full object-contain"
                        />
                      )}
                    </div>
                    <div className="w-6 h-6 rounded-full mb-1 flex items-center justify-center text-white font-bold text-xs absolute top-1 right-1 bg-green-500">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6L9 17l-5-5"></path>
                      </svg>
                    </div>
                    <button
                      onClick={() => handleDeleteClub(club.id)}
                      className="absolute top-1 left-1 text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                      </svg>
                    </button>

                    <h3
                      className="font-bold text-gray-800 text-xs cursor-pointer"
                      onClick={() => handleClubSelect(club)}
                    >
                      {club.name}
                    </h3>
                    <p className="text-xs text-green-600 font-medium">
                      Proprietario
                    </p>
                  </div>
                );
              } else {
                return (
                  <div
                    key={`empty-slot-${index}`}
                    className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-3 flex flex-col items-center justify-center text-center h-32 cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setShowClubCreationForm(true)}
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mb-1">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-blue-600"
                      >
                        <path d="M5 12h14"></path>
                        <path d="M12 5v14"></path>
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-600">
                      Crea nuovo club
                    </p>
                  </div>
                );
              }
            })}
          </div>
        </div>

        {/* Club accesses via token section */}
        {userClubs.filter(
          (club) => club.role !== "club_creator" && club.role !== "owner",
        ).length > 0 && (
          <div className="bg-white rounded-3xl shadow-xl p-4">
            <div className="flex items-center justify-center mb-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
              <h2 className="text-lg font-semibold text-center">
                Accessi tramite token
              </h2>
            </div>
            <p className="text-xs text-gray-500 text-center mb-4">
              Club a cui hai accesso tramite token di invito
            </p>
            <div className="grid grid-cols-2 gap-3">
              {userClubs
                .filter(
                  (club) =>
                    club.role !== "club_creator" && club.role !== "owner",
                )
                .map((club) => (
                  <div
                    key={club.id}
                    className="bg-white rounded-xl shadow-md p-3 transition-all hover:shadow-lg border border-gray-200 flex flex-col items-center text-center relative"
                  >
                    <div
                      className="w-16 h-16 mb-2 flex items-center justify-center cursor-pointer"
                      onClick={() => handleClubSelect(club)}
                    >
                      {club.logo_url ? (
                        <img
                          src={club.logo_url}
                          alt={`${club.name} Logo`}
                          className="w-full h-full object-contain rounded-lg"
                          onError={(e) => {
                            // Fallback to initials if logo fails to load
                            e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${club.name}`;
                          }}
                        />
                      ) : (
                        <img
                          src={`https://api.dicebear.com/7.x/initials/svg?seed=${club.name}`}
                          alt={`${club.name} Logo`}
                          className="w-full h-full object-contain"
                        />
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteClub(club.id)}
                      className="absolute top-2 left-2 text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                      </svg>
                    </button>

                    <h3
                      className="font-bold text-gray-800 text-sm cursor-pointer"
                      onClick={() => handleClubSelect(club)}
                    >
                      {club.name}
                    </h3>
                    <p className="text-xs text-gray-600 font-medium">
                      {club.roleLabel}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Add access button - always visible */}
        <div className="bg-white rounded-3xl shadow-xl p-4 text-center">
          <div className="flex items-center justify-center mb-3">
            <div className="w-2 h-2 bg-orange-500 rounded-full mr-2"></div>
            <h2 className="text-lg font-semibold">
              {userClubs.filter(
                (club) => club.role !== "club_creator" && club.role !== "owner",
              ).length > 0
                ? "Aggiungi nuovo accesso"
                : "Accedi con token"}
            </h2>
          </div>
          <p className="text-gray-500 mb-3 text-sm">
            {userClubs.filter(
              (club) => club.role !== "club_creator" && club.role !== "owner",
            ).length > 0
              ? "Inserisci un token per accedere a un altro club"
              : "Inserisci un token per accedere a un club esistente"}
          </p>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => {
              setShowTokenSection(true);
              setTokenValues(Array(tokenLength).fill(""));
            }}
          >
            🎫 INSERISCI TOKEN
          </Button>
        </div>

        {/* Token Input Section */}
        {showTokenSection && (
          <div className="bg-white rounded-3xl shadow-xl p-4">
            <h2 className="text-lg font-medium text-center mb-4 text-gray-800">
              Inserisci il token {tokenLength} caratteri per accedere
            </h2>

            {/* Token Length Selector */}
            <div className="flex justify-center mb-4">
              <div className="inline-flex rounded-md shadow-sm">
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-medium rounded-l-lg ${tokenLength === 5 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700"}`}
                  onClick={() => handleTokenLengthChange(5)}
                >
                  5
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-medium ${tokenLength === 8 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700"}`}
                  onClick={() => handleTokenLengthChange(8)}
                >
                  8
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-medium rounded-r-lg ${tokenLength === 10 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700"}`}
                  onClick={() => handleTokenLengthChange(10)}
                >
                  10
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div
                className="flex justify-center gap-2 mb-6"
                style={{ width: "100%", maxWidth: "400px", margin: "0 auto" }}
              >
                <div className="flex flex-row gap-2">
                  {Array.from({ length: tokenLength }).map((_, index) => (
                    <input
                      key={index}
                      id={`token-input-${index}`}
                      type="text"
                      maxLength={1}
                      value={tokenValues[index] || ""}
                      onChange={(e) =>
                        handleTokenInputChange(index, e.target.value)
                      }
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="w-10 h-12 text-center text-xl font-bold border-2 border-blue-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none bg-blue-50"
                      autoComplete="off"
                    />
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md mb-4">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 rounded-lg py-2 mt-4"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Verifica in corso...
                  </>
                ) : (
                  "Verifica Token"
                )}
              </Button>
            </form>
          </div>
        )}

        {/* Footer Section */}
        <div className="mt-4 text-center text-gray-400">
          <p className="text-xs">
            © {new Date().getFullYear()} EasyGame. Tutti i diritti riservati.
          </p>
        </div>
      </div>

      {/* Profile Modal */}
      {showProfileModal && (
        <ProfileModal
          userId={userId}
          initialName={userName}
          initialImage={profileImage}
          onClose={() => setShowProfileModal(false)}
          onUpdate={handleProfileUpdate}
        />
      )}

      {/* Club Creation Form Modal */}
      {showClubCreationForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Crea Nuovo Club</h2>
            <ClubCreationForm
              userId={userId}
              onSuccess={handleClubCreationSuccess}
              onCancel={() => setShowClubCreationForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
