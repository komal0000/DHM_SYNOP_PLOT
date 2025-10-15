"""
GeoServer Proxy View to handle CORS issues
"""
from django.http import HttpResponse
from django.views import View
import requests
import logging

logger = logging.getLogger(__name__)

class GeoServerProxy(View):
    """Proxy requests to GeoServer to avoid CORS issues"""
    
    GEOSERVER_BASE_URL = "http://localhost:8080/geoserver"
    
    def get(self, request):
        """Forward GET requests to GeoServer with CORS headers"""
        try:
            # Build the full URL with query parameters
            path = request.GET.get('path', '')
            query_string = request.META.get('QUERY_STRING', '')
            
            # Remove 'path=' from query string if present
            if 'path=' in query_string:
                query_parts = query_string.split('&')
                query_parts = [p for p in query_parts if not p.startswith('path=')]
                query_string = '&'.join(query_parts)
            
            url = f"{self.GEOSERVER_BASE_URL}/{path}"
            if query_string:
                url = f"{url}?{query_string}"
            
            logger.info(f"Proxying request to: {url}")
            
            # Forward request to GeoServer
            response = requests.get(url, timeout=30)
            
            # Create Django response with GeoServer content
            django_response = HttpResponse(
                content=response.content,
                status=response.status_code,
                content_type=response.headers.get('Content-Type', 'image/png')
            )
            
            # Add CORS headers
            django_response['Access-Control-Allow-Origin'] = '*'
            django_response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
            django_response['Access-Control-Allow-Headers'] = 'Content-Type'
            
            return django_response
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error proxying GeoServer request: {e}")
            return HttpResponse(
                content=f"Error connecting to GeoServer: {str(e)}",
                status=502
            )
    
    def options(self, request):
        """Handle preflight OPTIONS requests"""
        response = HttpResponse()
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
