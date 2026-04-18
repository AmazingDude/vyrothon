-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Face" (
    "grabId" TEXT NOT NULL,
    "descriptor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Face_pkey" PRIMARY KEY ("grabId")
);

-- CreateTable
CREATE TABLE "ImageFace" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "faceId" TEXT NOT NULL,

    CONSTRAINT "ImageFace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Image_filePath_key" ON "Image"("filePath");

-- CreateIndex
CREATE INDEX "Image_filePath_idx" ON "Image"("filePath");

-- CreateIndex
CREATE INDEX "Face_grabId_idx" ON "Face"("grabId");

-- CreateIndex
CREATE UNIQUE INDEX "ImageFace_imageId_faceId_key" ON "ImageFace"("imageId", "faceId");

-- AddForeignKey
ALTER TABLE "ImageFace" ADD CONSTRAINT "ImageFace_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageFace" ADD CONSTRAINT "ImageFace_faceId_fkey" FOREIGN KEY ("faceId") REFERENCES "Face"("grabId") ON DELETE CASCADE ON UPDATE CASCADE;
