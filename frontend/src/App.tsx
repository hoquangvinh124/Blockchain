import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { SiteLayout } from "@/components/SiteLayout";
import ExplorePage from "@/pages/ExplorePage";
import CollectionsPage from "@/pages/CollectionsPage";
import CollectionDetailPage from "@/pages/CollectionDetailPage";
import TokenDetailPage from "@/pages/TokenDetailPage";
import NftBrowsePage from "@/pages/NftBrowsePage";
import CreatePage from "@/pages/CreatePage";
import JuryPage from "@/pages/JuryPage";
import ProfilePage from "@/pages/ProfilePage";

function App() {
  return (
    <>
    <Toaster position="bottom-right" richColors theme="dark" />
    <Routes>
      <Route path="/" element={<Navigate replace to="/app/explore" />} />

      <Route path="/app" element={<SiteLayout />}>
        <Route index element={<Navigate replace to="explore" />} />
        <Route path="explore" element={<ExplorePage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="collection/:setId" element={<CollectionDetailPage />} />
        <Route path="token/:tokenId" element={<TokenDetailPage />} />
        <Route path="nfts" element={<NftBrowsePage />} />
        <Route path="create" element={<CreatePage />} />
        <Route path="jury" element={<JuryPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate replace to="/app/explore" />} />
    </Routes>
    </>
  );
}

export default App;
