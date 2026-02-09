const state = require('./eyercloud_downloader/download_state.json');
const mapping = require('./eyercloud_downloader/bytescale_mapping_v2.json');

const aparecido = Object.entries(state.exam_details).find(([id, data]) =>
  data.patient_name?.toUpperCase().includes('APARECIDO ROBERTO LOCAISE')
);

if (aparecido) {
  const [examId, data] = aparecido;
  console.log('APARECIDO ROBERTO LOCAISE no EyerCloud:');
  console.log('  exam_id:', examId);
  console.log('  expected_images:', data.expected_images);
  console.log('  has image_details:', !!data.image_details);

  if (data.image_details) {
    const types = data.image_details.reduce((acc, img) => {
      acc[img.type] = (acc[img.type] || 0) + 1;
      return acc;
    }, {});
    console.log('  image types:', types);
  }

  // Check if in mapping
  const inMapping = Object.values(mapping).find(m => m.exam_id === examId);
  console.log('  in bytescale_mapping_v2:', !!inMapping);
  if (inMapping) {
    console.log('    mapping images:', inMapping.images?.length || 0);
  }
} else {
  console.log('Aparecido não encontrado no download_state');
}
