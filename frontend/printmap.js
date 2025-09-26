import Print from 'ol-ext/control/Print';
 // Initialize map

  // Add Print control
  const printControl = new ol.control.Print();
  map.addControl(printControl);

  // Handle print start
  printControl.on('printing', function (e) {
    document.body.style.opacity = 0.5;
  });

  // Handle print result
  printControl.on(['print', 'error'], function (e) {
    document.body.style.opacity = 1;

    if (e.image) {
      if (e.pdf) {
        // PDF export skipped (jsPDF not included)
        console.warn('PDF export skipped: jsPDF not loaded.');
      } else {
        // Export image using native download
        const link = document.createElement('a');
        link.href = e.image;
        link.download = 'map.' + e.imageType.replace('image/', '');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } else {
      console.warn('No canvas to export');
    }
  });