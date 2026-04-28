"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

export default function ProfilePage({
  params,
}: {
  params: { userId: string };
}) {
  const router = useRouter();
  const { userId } = params;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [showPasswordSection, setShowPasswordSection] = useState(false);

  // Load user data
  useEffect(() => {
    const loadUserData = async () => {
      if (!userId) return;

      try {
        // First get user auth data for email
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user?.email) {
          setEmail(authData.user.email);
        }

        // Check if we already have profile data in localStorage
        const storedProfileImage = localStorage.getItem(
          `profileImage_${userId}`,
        );
        const storedUserProfile = localStorage.getItem(`userProfile_${userId}`);

        if (storedProfileImage) {
          setProfileImage(storedProfileImage);
        }

        if (storedUserProfile) {
          try {
            const parsedProfile = JSON.parse(storedUserProfile);
            setFirstName(parsedProfile.firstName || "");
            setLastName(parsedProfile.lastName || "");
            setPhone(parsedProfile.phone || "");
          } catch (e) {
            console.error("Error parsing stored profile:", e);
          }
        }

        // Get user data from Supabase database
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("*")
          .eq("id", userId)
          .single();

        if (userError && userError.code !== "PGRST116") {
          console.error("Error fetching user data:", userError);
        }

        if (userData) {
          console.log("User data loaded from database:", userData);
          // Set profile image
          if (userData.profile_image) {
            setProfileImage(userData.profile_image);
          } else if (!profileImage && !storedProfileImage) {
            const defaultImage = `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`;
            setProfileImage(defaultImage);
          }

          // Set user data from database
          setFirstName(userData.first_name || "");
          setLastName(userData.last_name || "");
          setPhone(userData.phone || "");
          if (userData.email) {
            setEmail(userData.email);
          }
        } else {
          // If no user data in database, check auth metadata
          if (authData?.user?.user_metadata) {
            const metadata = authData.user.user_metadata;
            setFirstName(metadata.firstName || metadata.first_name || "");
            setLastName(metadata.lastName || metadata.last_name || "");
            setPhone(metadata.phone || "");
            if (metadata.profileImage) {
              setProfileImage(metadata.profileImage);
            }
          }
        }

        // Set default profile image if none exists
        if (!profileImage && !storedProfileImage && !userData?.profile_image) {
          const defaultImage = `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`;
          setProfileImage(defaultImage);
        }
      } catch (err) {
        console.error("Error loading user data:", err);
      }
    };

    loadUserData();
  }, [userId]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Simple validation
    if (file.size > 5 * 1024 * 1024) {
      setError("L'immagine deve essere inferiore a 5MB");
      return;
    }

    try {
      setIsUploading(true);
      setError("");

      // For demo purposes, we'll use a placeholder image instead of actual upload
      const seed = Math.random().toString(36).substring(2, 10);
      const newImageUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
      setProfileImage(newImageUrl);
      setIsUploading(false);
    } catch (err) {
      console.error("Error uploading image:", err);
      setError("Errore durante il caricamento dell'immagine");
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setLoading(true);
    setError("");

    try {
      // First check if user exists in users table
      const { data: existingUser, error: checkError } = await supabase
        .from("users")
        .select("id")
        .eq("id", userId)
        .single();

      if (checkError && checkError.code === "PGRST116") {
        // User doesn't exist, create new record
        const { error: insertError } = await supabase.from("users").insert({
          id: userId,
          email: email,
          first_name: firstName,
          last_name: lastName,
          phone: phone,
          profile_image: profileImage,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (insertError) {
          throw insertError;
        }
      } else if (checkError) {
        throw checkError;
      } else {
        // User exists, update record
        const { error: updateError } = await supabase
          .from("users")
          .update({
            first_name: firstName,
            last_name: lastName,
            phone: phone,
            profile_image: profileImage,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (updateError) {
          throw updateError;
        }
      }

      // Update local storage
      localStorage.setItem(`profileImage_${userId}`, profileImage);
      localStorage.setItem(`userName_${userId}`, `${firstName} ${lastName}`);
      localStorage.setItem(
        `userProfile_${userId}`,
        JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          profileImage,
        }),
      );

      // Show success message
      alert("Profilo aggiornato con successo!");

      // Redirect back to token verification page
      router.push(`/token-verification/${userId}`);
    } catch (err) {
      console.error("Error updating profile:", err);
      setError("Errore durante l'aggiornamento del profilo");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    if (newPassword !== confirmPassword) {
      setError("Le password non coincidono");
      return;
    }

    if (newPassword.length < 6) {
      setError("La password deve essere di almeno 6 caratteri");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Update password using Supabase Auth
      const { error: passwordError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (passwordError) {
        throw passwordError;
      }

      // Clear password fields
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordSection(false);

      alert("Password aggiornata con successo!");
    } catch (err: any) {
      console.error("Error updating password:", err);
      setError(err.message || "Errore durante l'aggiornamento della password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-cyan-400 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md mx-auto bg-white rounded-3xl shadow-xl p-8">
        <div className="flex flex-col items-center mb-6">
          <img
            src="https://r2.fivemanage.com/LxmV791LM4K69ERXKQGHd/image/logo.png"
            alt="EasyGame Logo"
            className="h-16 w-auto mb-2"
          />
          <h1 className="text-2xl font-bold">Il Tuo Profilo</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col items-center mb-6">
            <div className="relative h-24 w-24 mb-4">
              <img
                src={
                  profileImage ||
                  "https://api.dicebear.com/7.x/avataaars/svg?seed=default"
                }
                alt="Profile"
                className="h-full w-full rounded-full object-cover border-4 border-blue-500"
              />
              <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-20 rounded-full flex items-center justify-center transition-all">
                <span className="text-white opacity-0 hover:opacity-100 text-xs font-medium">
                  Cambia
                </span>
              </div>
            </div>

            <Label
              htmlFor="profile-image"
              className="cursor-pointer text-blue-600 hover:text-blue-800"
            >
              Carica nuova immagine
            </Label>
            <Input
              id="profile-image"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
              disabled={isUploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="firstName">Nome</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Il tuo nome"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">Cognome</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Il tuo cognome"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} disabled className="bg-gray-50" />
            <p className="text-xs text-gray-500">
              L'email non può essere modificata
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Cellulare</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Il tuo numero di cellulare"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex space-x-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => router.push(`/token-verification/${userId}`)}
            >
              Annulla
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              disabled={loading}
            >
              {loading ? "Salvataggio..." : "Salva Profilo"}
            </Button>
          </div>

          {/* Password Section */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Modifica Password</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPasswordSection(!showPasswordSection)}
              >
                {showPasswordSection ? "Nascondi" : "Mostra"}
              </Button>
            </div>

            {showPasswordSection && (
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Password Attuale</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Password attuale"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nuova Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nuova password (min. 6 caratteri)"
                    required
                    minLength={6}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">
                    Conferma Nuova Password
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Conferma nuova password"
                    required
                    minLength={6}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-red-600 hover:bg-red-700"
                  disabled={loading}
                >
                  {loading ? "Aggiornamento..." : "Aggiorna Password"}
                </Button>
              </form>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
